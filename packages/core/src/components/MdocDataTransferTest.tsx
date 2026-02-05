import React from 'react'
import { mdocDataTransfer, useMdocDataTransferShutdownOnUnmount } from '@animo-id/expo-mdoc-data-transfer'
import { Buffer } from 'buffer'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Button,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { type Permission, PermissionsAndroid } from 'react-native'

import QrCode from 'react-native-qrcode-svg'

// Helper function to create a minimal valid CBOR-encoded DeviceResponse
// According to ISO/IEC 18013-5, DeviceResponse structure:
// DeviceResponse = {
//   "version" : tstr,
//   "documents" : [* Document],
//   ? "documentErrors" : [* DocumentError]
//   ? "status" : uint
// }
const createMinimalDeviceResponse = (): Uint8Array => {
  // This creates a CBOR map with required fields + status
  // In CBOR: Map with 3 entries
  const cbor: number[] = [
    0xa3, // Map with 3 entries
    
    // Key: "version" (text string, 7 characters)
    0x67, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e,
    // Value: "1.0" (text string, 3 characters)
    0x63, 0x31, 0x2e, 0x30,
    
    // Key: "documents" (text string, 9 characters)
    0x69, 0x64, 0x6f, 0x63, 0x75, 0x6d, 0x65, 0x6e, 0x74, 0x73,
    // Value: empty array
    0x80,
    
    // Key: "status" (text string, 6 characters)
    0x66, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73,
    // Value: 0 (unsigned integer - OK/Success)
    0x00
  ]
  
  return new Uint8Array(cbor)
}

const PERMISSIONS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.ACCESS_COARSE_LOCATION',
] as const as Permission[]

enum EngagementState {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  WAITING_FOR_REQUEST = 'WAITING_FOR_REQUEST',
  PROCESSING_REQUEST = 'PROCESSING_REQUEST',
  SENDING_RESPONSE = 'SENDING_RESPONSE',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: Date
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

const requestPermissions = async () => {
  try {
    const results = await PermissionsAndroid.requestMultiple(PERMISSIONS)
    const allGranted = Object.values(results).every((status) => status === 'granted')
    return allGranted
  } catch (error) {
    console.error('Permission request failed:', error)
    return false
  }
}

export const MdocDataTransferTest = () => {
  const { height: screenHeight } = useWindowDimensions()
  const [qrCode, setQrCode] = useState<string>()
  const [state, setState] = useState<EngagementState>(EngagementState.IDLE)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [responseData, setResponseData] = useState<string>('')
  const [permissionsGranted, setPermissionsGranted] = useState<boolean>(false)
  const scrollViewRef = useRef<ScrollView>(null)

  // useMdocDataTransferShutdownOnUnmount()

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = { timestamp: new Date(), message, type }
    setLogs((prev) => [...prev, entry])
  }, [])

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true })
  }, [logs])

  const handleRequestPermissions = async () => {
    addLog('Requesting permissions...', 'info')
    const granted = await requestPermissions()
    setPermissionsGranted(granted)
    if (granted) {
      addLog('All permissions granted', 'success')
    } else {
      addLog('Some permissions were denied', 'error')
    }
  }

  const startEngagement = async () => {
    // if (Platform.OS === 'android' && !permissionsGranted) {
    //   Alert.alert('Permissions Required', 'Please grant all permissions first')
    //   return
    // }

    try {
      setState(EngagementState.INITIALIZING)
      setQrCode(undefined)
      addLog('Initializing mDoc data transfer...', 'info')

      const mdt = mdocDataTransfer.instance()
      addLog('Enabling NFC...', 'info')
      mdt.enableNfc()

      addLog('Starting QR engagement...', 'info')
      const qr = await mdt.startQrEngagement()
      setQrCode(qr)
      addLog(`QR code generated: ${qr.substring(0, 50)}...`, 'success')

      setState(EngagementState.WAITING_FOR_REQUEST)
      addLog('Waiting for device request...', 'info')

      const deviceRequest = await mdt.waitForDeviceRequest()
      setState(EngagementState.PROCESSING_REQUEST)

      const requestHex = Buffer.from(deviceRequest.deviceRequest).toString('hex')
      const transcriptHex = Buffer.from(deviceRequest.sessionTranscript).toString('hex')

      addLog(`Received device request (${deviceRequest.deviceRequest.length} bytes)`, 'success')
      addLog(`Device request hex: ${requestHex.substring(0, 100)}...`, 'info')
      addLog(`Session transcript (${deviceRequest.sessionTranscript.length} bytes)`, 'info')
      addLog(`Session transcript hex: ${transcriptHex.substring(0, 100)}...`, 'info')

      // Parse device request and prepare response
      addLog('Processing device request...', 'warning')

      setState(EngagementState.SENDING_RESPONSE)

      // Create a sample response (in a real app, this would be generated based on the request)
      let response: Uint8Array
      if (responseData === 'EMPTY') {
        // Explicitly send empty response for testing error handling
        response = new Uint8Array()
        addLog('Sending empty response (for testing - will likely be rejected)', 'warning')
      } else if (responseData && responseData.trim()) {
        try {
          // Try to parse as hex
          const hexData = responseData.replace(/\s/g, '')
          response = new Uint8Array(Buffer.from(hexData, 'hex'))
          addLog(`Using custom hex response (${response.length} bytes)`, 'info')
        } catch (error) {
          // Fall back to UTF-8
          response = new Uint8Array(Buffer.from(responseData, 'utf8'))
          addLog(`Using custom UTF-8 response (${response.length} bytes)`, 'info')
        }
      } else {
        // Create minimal valid CBOR DeviceResponse structure per ISO 18013-5
        response = createMinimalDeviceResponse()
        const responseHex = Buffer.from(response).toString('hex')
        addLog(`Using minimal DeviceResponse (${response.length} bytes): ${responseHex}`, 'info')
      }

      addLog('Sending device response...', 'info')
      await mdt.sendDeviceResponse(response)

      setState(EngagementState.COMPLETED)
      addLog('Device response sent successfully!', 'success')
      addLog('Engagement completed', 'success')

      // Auto-shutdown after a delay
      setTimeout(() => {
        addLog('Auto-shutting down...', 'info')
        mdt.shutdown()
        setState(EngagementState.IDLE)
      }, 2000)
    } catch (error) {
      setState(EngagementState.ERROR)
      addLog(`Error: ${error instanceof Error ? error.message : String(error)}`, 'error')
      console.error('Engagement error:', error)
    }
  }

  const shutdown = () => {
    try {
      if (mdocDataTransfer.isInitialized()) {
        addLog('Shutting down...', 'info')
        mdocDataTransfer.instance().shutdown()
        setState(EngagementState.IDLE)
        setQrCode(undefined)
        addLog('Shutdown complete', 'success')
      } else {
        addLog('No active instance to shutdown', 'warning')
      }
    } catch (error) {
      addLog(`Shutdown error: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const clearLogs = () => {
    setLogs([])
  }

  const getStateColor = () => {
    switch (state) {
      case EngagementState.IDLE:
        return '#666'
      case EngagementState.INITIALIZING:
      case EngagementState.WAITING_FOR_REQUEST:
      case EngagementState.PROCESSING_REQUEST:
      case EngagementState.SENDING_RESPONSE:
        return '#2196F3'
      case EngagementState.COMPLETED:
        return '#4CAF50'
      case EngagementState.ERROR:
        return '#F44336'
    }
  }

  const isEngagementActive =
    state !== EngagementState.IDLE &&
    state !== EngagementState.COMPLETED &&
    state !== EngagementState.ERROR

  return (
      <ScrollView style={[styles.content, { height: screenHeight * 0.8 }]} nestedScrollEnabled>
        {/* Permissions Section */}
        {Platform.OS === 'android' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Permissions</Text>
            <Button
              title={permissionsGranted ? 'Permissions Granted ✓' : 'Request Permissions'}
              onPress={handleRequestPermissions}
              disabled={permissionsGranted}
              color={permissionsGranted ? '#4CAF50' : undefined}
            />
          </View>
        )}

        {/* Control Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Controls</Text>
          <View style={styles.buttonRow}>
            <View style={styles.buttonContainer}>
              <Button
                title="Start Engagement"
                onPress={startEngagement}
                disabled={isEngagementActive}
                color="#2196F3"
              />
            </View>
            <View style={styles.buttonContainer}>
              <Button title="Shutdown" onPress={shutdown} color="#F44336" />
            </View>
          </View>
        </View>

        {/* Response Data Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Response Data</Text>
          <Text style={styles.hint}>
            Leave empty to send minimal valid CBOR DeviceResponse, or enter custom hex/text
          </Text>
          <View style={styles.presetButtons}>
            <Button
              title="Minimal Valid"
              onPress={() => setResponseData('')}
              disabled={isEngagementActive}
              color="#4CAF50"
            />
            <Button
              title="Empty (Invalid)"
              onPress={() => setResponseData('EMPTY')}
              disabled={isEngagementActive}
              color="#FF9800"
            />
          </View>
          <TextInput
            style={styles.input}
            value={responseData === 'EMPTY' ? '' : responseData}
            onChangeText={setResponseData}
            placeholder="Custom hex or text (optional)..."
            multiline
            numberOfLines={3}
            editable={!isEngagementActive}
          />
        </View>

        {/* QR Code Display */}
        {qrCode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>QR Code</Text>
            <View style={styles.qrContainer}>
              <QrCode value={qrCode} size={250} />
            </View>
            <Text style={styles.qrData} numberOfLines={2} ellipsizeMode="middle">
              {qrCode}
            </Text>
          </View>
        )}

        {/* Loading Indicator */}
        {isEngagementActive && (
          <View style={styles.section}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>{state.replace(/_/g, ' ')}</Text>
          </View>
        )}

        {/* Logs Section */}
        <View style={styles.section}>
          <View style={styles.logHeader}>
            <Text style={styles.sectionTitle}>Activity Log</Text>
            <Button title="Clear" onPress={clearLogs} color="#666" />
          </View>
          <ScrollView ref={scrollViewRef} style={styles.logContainer} nestedScrollEnabled>
            {logs.length === 0 ? (
              <Text style={styles.emptyLog}>No activity yet</Text>
            ) : (
              logs.map((log, index) => (
                <View key={index} style={styles.logEntry}>
                  <Text style={[styles.logType, { color: getLogColor(log.type) }]}>
                    {log.type.toUpperCase()}
                  </Text>
                  <Text style={styles.logTime}>{log.timestamp.toLocaleTimeString()}</Text>
                  <Text style={styles.logMessage}>{log.message}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
  )
}

const getLogColor = (type: LogEntry['type']) => {
  switch (type) {
    case 'success':
      return '#4CAF50'
    case 'error':
      return '#F44336'
    case 'warning':
      return '#FF9800'
    case 'info':
      return '#2196F3'
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    paddingTop: Platform.select({ ios: 60, android: (StatusBar.currentHeight || 0) + 16 }),
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  buttonContainer: {
    flex: 1,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  presetButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 16,
    padding: 16,
    backgroundColor: '#fff',
  },
  qrData: {
    fontSize: 10,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 8,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logContainer: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#fafafa',
  },
  emptyLog: {
    textAlign: 'center',
    color: '#999',
    padding: 16,
  },
  logEntry: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logType: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  logTime: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  logMessage: {
    fontSize: 12,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
})
