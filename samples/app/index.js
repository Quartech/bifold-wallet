import 'reflect-metadata'

// Debug: Verify reflect-metadata is loaded
if (typeof Reflect === 'undefined' || typeof Reflect.metadata === 'undefined') {
  console.error('❌ CRITICAL: Reflect.metadata is not available!')
} else {
  console.log('✅ Reflect.metadata is available')
}

// Workaround for class-transformer @Expose decorator not working in React Native
// This patches plainToInstance to fix @id and @type mappings before validation
const setupClassTransformerPatch = () => {
  try {
    const classTransformer = require('class-transformer')
    
    if (classTransformer && classTransformer.plainToInstance) {
      const originalPlainToInstance = classTransformer.plainToInstance
      
      classTransformer.plainToInstance = function(cls, plain, options) {
        // Fix @id and @type mappings for DIDComm messages before transformation
        if (plain && typeof plain === 'object' && !Array.isArray(plain)) {
          // Map @id to id if id doesn't exist
          if (!plain.id && plain['@id']) {
            plain.id = plain['@id']
          }
          
          // Map @type to type if type doesn't exist
          if (!plain.type && plain['@type']) {
            plain.type = plain['@type']
          }
          
          // Special handling for OutOfBandInvitation services array
          if (Array.isArray(plain.services)) {
            try {
              const { OutOfBandDidCommService } = require('@credo-ts/didcomm')
              
              plain.services = plain.services.map(service => {
                // If it's already a string (DID), leave it as-is
                if (typeof service === 'string') {
                  return service
                }
                
                // If it's an object (inline service), convert to OutOfBandDidCommService instance
                if (service && typeof service === 'object') {
                  return new OutOfBandDidCommService({
                    id: service.id,
                    serviceEndpoint: service.serviceEndpoint,
                    recipientKeys: service.recipientKeys || [],
                    routingKeys: service.routingKeys || [],
                    accept: service.accept
                  })
                }
                
                return service
              })
            } catch (error) {
              console.warn('Could not transform services array:', error)
            }
          }
        }
        
        return originalPlainToInstance.call(this, cls, plain, options)
      }
      
      console.log('✅ class-transformer patch applied successfully')
    }
  } catch (error) {
    console.error('❌ Failed to apply class-transformer patch:', error)
  }
}

setupClassTransformerPatch()

import 'fast-text-encoding' // polyfill for TextEncoder and TextDecoder
import 'react-native-gesture-handler'
import '@formatjs/intl-getcanonicallocales/polyfill'
import '@formatjs/intl-locale/polyfill'
import '@formatjs/intl-pluralrules/polyfill'
import '@formatjs/intl-pluralrules/locale-data/en' // locale-data for en
import '@formatjs/intl-displaynames/polyfill'
import '@formatjs/intl-displaynames/locale-data/en' // locale-data for en
import '@formatjs/intl-listformat/polyfill'
import '@formatjs/intl-listformat/locale-data/en' // locale-data for en
import '@formatjs/intl-numberformat/polyfill'
import '@formatjs/intl-numberformat/locale-data/en' // locale-data for en
import '@formatjs/intl-relativetimeformat/polyfill'
import '@formatjs/intl-relativetimeformat/locale-data/en' // locale-data for en
import '@formatjs/intl-datetimeformat/polyfill'
import '@formatjs/intl-datetimeformat/locale-data/en' // locale-data for en
import '@formatjs/intl-datetimeformat/add-all-tz' // Add ALL tz data
import 'react-native-url-polyfill/auto'
import '@openwallet-foundation/askar-react-native'

//Used to decode base64 in sub-modules like openID4Vp, or any other decoder
import { decode, encode } from 'base-64'

if (!global.btoa) {
  global.btoa = encode
}

if (!global.atob) {
  global.atob = decode
}

import { Buffer } from 'buffer'

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer
}

import { initLanguages, translationResources, createApp, MainContainer } from '@bifold/core'
import { AppRegistry, LogBox } from 'react-native'
import { container } from 'tsyringe'

import { name as appName } from './app.json'
import { AppContainer } from './container-imp'

LogBox.ignoreAllLogs()

initLanguages(translationResources)
const bifoldContainer = new MainContainer(container.createChildContainer()).init()
const appContainer = new AppContainer(bifoldContainer).init()
const App = createApp(appContainer)
AppRegistry.registerComponent(appName, () => App)
