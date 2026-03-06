import React, { useEffect, useState } from "react";
import { StackScreenProps } from "@react-navigation/stack"
import { Alert, Button, DeviceEventEmitter, Platform, StyleSheet, Text, View } from "react-native";
import { PERMISSIONS, RESULTS, requestMultiple } from 'react-native-permissions';
import { RootStackParams, Screens } from "../../../types/navigators"
import { MdocDataTransfer } from 'expo-multipaz-data-transfer';
import { useOpenIDCredentials } from "../context/OpenIDCredentialRecordProvider";
import { OpenIDCredentialType } from "../types";
import { MdocRecord, Mdoc, TypedArrayEncoder, MdocDeviceResponse } from "@credo-ts/core";
import { EventTypes } from "../../../constants";
import { t } from "i18next";
import { BifoldError } from "../../../types/error";
import { useAgent } from "@bifold/react-hooks";
import { cborEncode, cborDecode, parseIssuerSigned } from '@animo-id/mdoc'

/**
 * Build a DeviceResponse CBOR structure for ISO 18013-5 presentment
 * 
 * This creates a minimal valid DeviceResponse by wrapping the mdoc's IssuerSigned data
 * in the proper structure. The filtering of requested claims happens here.
 */
async function buildDeviceResponse(
  mdoc: Mdoc,
  requestedNamespaces: Record<string, Record<string, boolean>>,
  requestedDocType: string,
  base64Url: string
): Promise<Uint8Array> {
  // Validate that the requested docType matches our credential
  if (mdoc.docType !== requestedDocType) {
    throw new Error(`DocType mismatch: requested ${requestedDocType}, have ${mdoc.docType}`);
  }

  console.log('Building device response for docType:', mdoc.docType);
  console.log('Requested namespaces:', JSON.stringify(requestedNamespaces, null, 2));
  console.log('Available namespaces in mdoc:', Object.keys(mdoc.issuerSignedNamespaces));

  // Decode the base64url mdoc to get the IssuerSigned structure
  // TypedArrayEncoder.fromBase64 supports both base64 and base64url formats
  const mdocBytes = TypedArrayEncoder.fromBase64(base64Url);
  const issuerSignedDocument = parseIssuerSigned(mdocBytes, mdoc.docType);
  
  const issuerAuth = issuerSignedDocument.issuerSigned.issuerAuth;
  const originalNameSpaces = issuerSignedDocument.issuerSigned.nameSpaces;
  
  console.log('Decoded IssuerSigned issuerAuth:', issuerAuth ? 'present' : 'missing');
  console.log('Available nameSpaces:', Object.keys(originalNameSpaces));
  
  // Filter namespaces to only include requested elements
  // nameSpaces is Record<string, IssuerSignedItem[]>
  const filteredNameSpaces: Record<string, any[]> = {};
  
  for (const [namespaceName, requestedElements] of Object.entries(requestedNamespaces)) {
    const namespaceItems = originalNameSpaces[namespaceName];
    if (!namespaceItems || !Array.isArray(namespaceItems)) {
      console.warn(`Requested namespace ${namespaceName} not found in credential`);
      continue;
    }
    
    // Filter items in this namespace to only include requested elements
    // Each item is an IssuerSignedItem
    const filteredItems = namespaceItems.filter((item) => {
      try {
        // IssuerSignedItem has an elementIdentifier property
        const elementIdentifier = item.elementIdentifier;
        return requestedElements[elementIdentifier] !== undefined;
      } catch (e) {
        console.error('Error processing issuer signed item:', e);
        return false;
      }
    });
    
    if (filteredItems.length > 0) {
      filteredNameSpaces[namespaceName] = filteredItems;
      console.log(`Namespace ${namespaceName}: filtered ${filteredItems.length}/${namespaceItems.length} items`);
    }
  }

  // Build the Document structure following ISO 18013-5 spec
  const document = {
    docType: mdoc.docType,
    issuerSigned: {
      nameSpaces: filteredNameSpaces,
      issuerAuth: issuerAuth,
    },
    deviceSigned: {
      nameSpaces: cborEncode({}), // Empty device namespaces (tagged bstr)
      deviceAuth: {
        deviceMac: null, // No device authentication for now
      }
    },
    errors: {} // No errors
  };

  // Build DeviceResponse according to ISO 18013-5:2021
  // DeviceResponse = {
  //   "version": tstr,
  //   "documents": [+Document],
  //   "status": uint
  // }
  const deviceResponse = {
    version: "1.0",
    documents: [document],
    status: 0 // STATUS_OK = 0
  };

  const encodedResponse = cborEncode(deviceResponse);
  console.log('Built device response:', encodedResponse.byteLength, 'bytes');
  
  // Convert to proper Uint8Array type
  return new Uint8Array(encodedResponse);
}

type OpenIDNfcPromptProps = StackScreenProps<RootStackParams, Screens.OpenIDNfcPrompt>

type DeviceRequest = {
  docType: string;
  namespaces: Record<string, Record<string, boolean>>;
  encodedRequest: Uint8Array;
}

const OpenIDNfcPrompt: React.FC<OpenIDNfcPromptProps> = ({ navigation, route }) => {
  const { credentialId, type } = route.params
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [lastRequest, setLastRequest] = useState<DeviceRequest | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('Not requested');
  const { getW3CCredentialById, getSdJwtCredentialById, getMdocCredentialById } = useOpenIDCredentials()
  const [credential, setCredential] = useState<MdocRecord | undefined>(undefined)
  const { agent } = useAgent();

  useEffect(() => {
    if (credential) {
      console.log(`Credential: ${JSON.stringify(Mdoc.fromBase64Url(credential.base64Url), null, 2)}`)
    }
  }, [credential])

  useEffect(() => {
    const fetchCredential = async () => {
      try {
        let record: MdocRecord | undefined

        if (type === OpenIDCredentialType.Mdoc) {
          record = await getMdocCredentialById(credentialId)
        } else {
          throw new Error('Unsupported credential type for NFC demo')
        }

        setCredential(record)
      } catch {
        // credential not found for id, display an error
        DeviceEventEmitter.emit(
          EventTypes.ERROR_ADDED,
          new BifoldError(t('Error.Title1033'), t('Error.Message1033'), t('CredentialDetails.CredentialNotFound'), 1035)
        )
      }
    }
    fetchCredential()
  }, [
    credentialId,
    type,
    getSdJwtCredentialById,
    getW3CCredentialById,
    getMdocCredentialById,
    t,
  ])

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Info', 'Permissions are only required on Android');
      return;
    }

    try {
      setPermissionStatus('Requesting permissions...');
      
      // Request all required permissions at once
      const result = await requestMultiple([
        PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
        PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE,
        PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
      ]);

      const bluetoothConnect = result[PERMISSIONS.ANDROID.BLUETOOTH_CONNECT];
      const bluetoothAdvertise = result[PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE];
      const location = result[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION];

      const allGranted = 
        bluetoothConnect === RESULTS.GRANTED &&
        bluetoothAdvertise === RESULTS.GRANTED &&
        location === RESULTS.GRANTED;

      setPermissionsGranted(allGranted);

      if (allGranted) {
        setPermissionStatus('All permissions granted');
        Alert.alert('Success', 'All required permissions have been granted');
      } else {
        const deniedPermissions = [];
        if (bluetoothConnect !== RESULTS.GRANTED) deniedPermissions.push('Bluetooth Connect');
        if (bluetoothAdvertise !== RESULTS.GRANTED) deniedPermissions.push('Bluetooth Advertise');
        if (location !== RESULTS.GRANTED) deniedPermissions.push('Location');
        
        setPermissionStatus(`Denied: ${deniedPermissions.join(', ')}`);
        Alert.alert(
          'Permissions Required',
          `The following permissions were not granted:\n${deniedPermissions.join('\n')}\n\nThese are required for NFC and BLE functionality.`
        );
      }
    } catch (error: any) {
      console.error('Error requesting permissions:', error);
      setPermissionStatus('Error requesting permissions');
      Alert.alert('Error', error.message || 'Failed to request permissions');
    }
  };

  const startEngagement = async () => {
    try {
      setStatus('Starting NFC engagement...');
      
      await MdocDataTransfer.startEngagement({
        onDeviceConnecting: () => {
          setStatus('Device connecting...');
          console.log('Device connecting');
        },
        
        onDeviceConnected: () => {
          setStatus('Connected via BLE - waiting for request');
          console.log('Device connected via BLE');
        },
        
        onDeviceRequest: async (request: DeviceRequest) => {
          setStatus('Request received');
          setLastRequest(request);
          console.log('Device request received:', request.encodedRequest.byteLength, 'bytes');
          
          try {
            // Minimal empty device response (no credential)
            const minimalDeviceResponse = new Uint8Array([
              0xa3,                                              
              0x67, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 
              0x63, 0x31, 0x2e, 0x30,                          
              0x69, 0x64, 0x6f, 0x63, 0x75, 0x6d, 0x65, 0x6e, 0x74, 0x73, 
              0x80,                                             
              0x66, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73,       
              0x00                                          
            ]);

            // Prepare device response with actual credential
            let deviceResponse: Uint8Array = minimalDeviceResponse;
            
            if (credential && agent) {
              try {
                // Get the mdoc instance from the credential record
                const mdocInstance = Mdoc.fromBase64Url(credential.base64Url);
                console.log('Loaded mdoc with docType:', mdocInstance.docType);
                console.log('Namespaces:', Object.keys(mdocInstance.issuerSignedNamespaces));
                
                // Build the device response with requested claims
                deviceResponse = await buildDeviceResponse(
                  mdocInstance,
                  request.namespaces,
                  request.docType,
                  credential.base64Url
                );
                
                console.log('Built device response:', deviceResponse.byteLength, 'bytes');
              } catch (error) {
                console.error('Error preparing credential for response:', error);
                Alert.alert('Error', 'Failed to prepare credential response. See console for details.');
              }
            }
            
            // Show consent dialog
            Alert.alert(
              'Document Request',
              'A verifier is requesting document information. Allow?',
              [
                {
                  text: 'Deny',
                  onPress: async () => {
                    // Send error response
                    await MdocDataTransfer.terminateSession();
                    setStatus('Request denied by user');
                  },
                  style: 'cancel'
                },
                {
                  text: 'Allow',
                  onPress: async () => {
                    try {
                      // Send response
                      await MdocDataTransfer.sendResponse(deviceResponse);
                      setStatus('Response sent - terminating session');
                      
                      // Terminate session
                      setTimeout(async () => {
                        try {
                          await MdocDataTransfer.terminateSession();
                          setStatus('Session terminated successfully');
                        } catch (e) {
                          console.warn('Session could not be terminated after timeout, can be ignored if handover finished:', e);
                        }
                      }, 500);
                    } catch (error) {
                      console.error('Error sending response:', error);
                      setStatus('Error sending response');
                    }
                  }
                }
              ]
            );
          } catch (error) {
            console.error('Error handling request:', error);
            setStatus('Error handling request');
          }
        },
        
        onDeviceDisconnected: (transportSpecificTermination: boolean) => {
          setStatus('Device disconnected');
          console.log('Device disconnected', { transportSpecificTermination });
        },
        
        onError: (message: string, type: string) => {
          setStatus(`Error: ${message} (${type})`);
          console.error('Transfer error:', message, type);
          Alert.alert('Transfer Error', message);
        }
      });
      
      setIsListening(true);
      setStatus('NFC engagement active - hold phone near reader');
    } catch (error: any) {
      console.error('Failed to start engagement:', error);
      setStatus(`Failed to start: ${error.message}`);
      Alert.alert('Error', error.message || 'Failed to start NFC engagement');
    }
  };

  const stopEngagement = async () => {
    try {
      setStatus('Stopping engagement...');
      await MdocDataTransfer.stopEngagement();
      setIsListening(false);
      setStatus('Engagement stopped');
    } catch (error: any) {
      console.error('Failed to stop engagement:', error);
      setStatus(`Failed to stop: ${error.message}`);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isListening) {
        MdocDataTransfer.stopEngagement().catch(console.error);
      }
    };
  }, [isListening]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>mDoc Data Transfer Demo</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Permissions:</Text>
        <Text style={[styles.statusText, permissionsGranted && styles.successText]}>
          {permissionStatus}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title="Request Permissions"
          onPress={requestPermissions}
          color="#4caf50"
          disabled={permissionsGranted}
        />
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Status:</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      {lastRequest && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoLabel}>Last Request:</Text>
          <Text style={styles.infoText}>{lastRequest.encodedRequest.length} bytes</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <Button
          title={isListening ? 'Stop Engagement' : 'Start NFC Engagement'}
          onPress={isListening ? stopEngagement : startEngagement}
          color={isListening ? '#d32f2f' : '#1976d2'}
        />
      </View>

      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsTitle}>Instructions:</Text>
        <Text style={styles.instructions}>
          1. Tap "Start NFC Engagement"{'\n'}
          2. Hold your phone near an NFC reader{'\n'}
          3. Wait for BLE connection{'\n'}
          4. Review and approve document request{'\n'}
          5. Tap "Stop Engagement" when done
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#000000',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    marginTop: 60,
    textAlign: 'center',
    color: 'white'
  },
  statusContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'black'
  },
  successText: {
    color: '#4caf50',
  },
  infoContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  infoText: {
    fontSize: 14,
    color: 'black',
  },
  buttonContainer: {
    marginVertical: 20,
  },
  instructionsContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: 'black'
  },
  instructions: {
    fontSize: 14,
    lineHeight: 22,
    color: '#666',
  },
});


export default OpenIDNfcPrompt