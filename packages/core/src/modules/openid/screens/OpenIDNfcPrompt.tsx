import React, { useEffect, useState } from "react";
import { StackScreenProps } from "@react-navigation/stack"
import { Alert, Button, Platform, StyleSheet, Text, View } from "react-native";
import { PERMISSIONS, RESULTS, requestMultiple } from 'react-native-permissions';
import { RootStackParams, Screens } from "../../../types/navigators"
import { MdocDataTransfer } from 'expo-multipaz-data-transfer';

type OpenIDNfcPromptProps = StackScreenProps<RootStackParams, Screens.OpenIDNfcPrompt>

const OpenIDNfcPrompt: React.FC<OpenIDNfcPromptProps> = ({ }) => {
const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [lastRequest, setLastRequest] = useState<Uint8Array | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('Not requested');

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
        
        onDeviceRequest: async (request: Uint8Array) => {
          setStatus('Request received');
          setLastRequest(request);
          console.log('Device request received:', request.byteLength, 'bytes');
          
          try {
            // In a real app, you would:
            // 1. Parse the CBOR-encoded DeviceRequest
            // 2. Show consent dialog to user
            // 3. Retrieve requested documents
            // 4. Create DeviceResponse with requested data
            
            // For demo purposes, create a minimal valid DeviceResponse
            // CBOR encoding of: {version: "1.0", documents: [], status: 0}
            const minimalDeviceResponse = new Uint8Array([
              0xa3,                                              // map(3)
              0x67, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e,  // "version"
              0x63, 0x31, 0x2e, 0x30,                           // "1.0"
              0x69, 0x64, 0x6f, 0x63, 0x75, 0x6d, 0x65, 0x6e, 0x74, 0x73,  // "documents"
              0x80,                                              // []
              0x66, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73,        // "status"
              0x00                                               // 0
            ]);
            
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
                      await MdocDataTransfer.sendResponse(minimalDeviceResponse);
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
          <Text style={styles.infoText}>{lastRequest.byteLength} bytes</Text>
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