import {
  AnonCredsDidCommCredentialFormatService,
  AnonCredsDidCommProofFormatService,
  AnonCredsModule,
  DataIntegrityDidCommCredentialFormatService,
  DidCommCredentialV1Protocol,
  DidCommProofV1Protocol,
  LegacyIndyDidCommCredentialFormatService,
  LegacyIndyDidCommProofFormatService,
} from '@credo-ts/anoncreds'

import { AskarModule } from '@credo-ts/askar'
import {
  Agent,
  DidsModule,
  JwkDidResolver,
  KeyDidResolver,
  PeerDidResolver,
  WebDidResolver,
  X509Module,
} from '@credo-ts/core'

import { 
  DidCommAutoAcceptCredential, 
  DidCommAutoAcceptProof,
  DidCommCredentialV2Protocol,
  DidCommProofV2Protocol, 
  DidCommDifPresentationExchangeProofFormatService,
  DidCommModule,
  DidCommMediatorPickupStrategy
} from '@credo-ts/didcomm'

import { IndyVdrAnonCredsRegistry, IndyVdrModule, IndyVdrPoolConfig } from '@credo-ts/indy-vdr'
import { WebVhAnonCredsRegistry, WebVhDidResolver } from '@credo-ts/webvh'
import { useAgent } from '@bifold/react-hooks'
import { OpenId4VcModule } from '@credo-ts/openid4vc'
// import { PushNotificationsApnsModule, PushNotificationsFcmModule } from '@credo-ts/push-notifications'
import { anoncreds } from '@hyperledger/anoncreds-react-native'
import { askar } from '@openwallet-foundation/askar-react-native'
import { indyVdr } from '@hyperledger/indy-vdr-react-native'
import { BifoldLogger } from '../services/logger'

interface GetAgentModulesOptions {
  indyNetworks: IndyVdrPoolConfig[]
  mediatorInvitationUrl?: string
  txnCache?: { capacity: number; expiryOffsetMs: number; path?: string }
  trustedCertificates?: string[]
}

export type BifoldAgentModules = ReturnType<typeof getAgentModules>

export type BifoldAgent = Agent<BifoldAgentModules>

/**
 * Fetches trusted certificates from a remote API
 * @param url The API endpoint URL
 * @returns Array of certificate strings
 */
async function fetchTrustedCertificates(url: string): Promise<string[]> {
  const certs =  [
    `MIIBkTCCATegAwIBAgIQY5tDW2NycsJNiUuR8PU8mjAKBggqhkjOPQQDAjAmMRcwFQYDVQQDEw5DcmVkbyBtREwgSUFDQTELMAkGA1UEBhMCVVMwIBcNMDAwMTAxMDAwMDAwWhgPMjA1MDAxMDEwMDAwMDBaMCYxFzAVBgNVBAMTDkNyZWRvIG1ETCBJQUNBMQswCQYDVQQGEwJVUzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABHOAwtvm6lwvHa0AWq1egBMhlwAqpx9P1cOD24CC1ao1hbxLWO7i6PtFxAIXXSKlnEF+OIicRfCGqhanW1d3cEWjRTBDMB0GA1UdDgQWBBSM7o7C62s2AfWB0a/xiInfyiaKJjAOBgNVHQ8BAf8EBAMCAQYwEgYDVR0TAQH/BAgwBgEB/wIBADAKBggqhkjOPQQDAgNIADBFAiBL9x/IH1mnnJ3mm93LiPBk1Ue/AKi99Z8mKcfl/6F3iQIhAM54odJBowTQQIrSayO9lMUWWqlPfK56zhx7x4FMQ4EA`,
    `MIIB7zCCAZagAwIBAgIRAJWCxcHSVa1ZEVlXj7RGEzQwCgYIKoZIzj0EAwIwJjEXMBUGA1UEAxMOQ3JlZG8gbURMIElBQ0ExCzAJBgNVBAYTAlVTMCAXDTAwMDEwMTAwMDAwMFoYDzIwNTAwMTAxMDAwMDAwWjAxMSIwIAYDVQQDExlDcmVkbyBtREwgRG9jdW1lbnQgU2lnbmVyMQswCQYDVQQGEwJVUzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABNwPVfMp6kXFYwA6pX6WfV/JsG3sNE7kJXR/0DqZGnbFaf2VHyO4MziEhUeBfoeZVBM+WTyZl+DiMC6/d+sS4MKjgZcwgZQwHQYDVR0OBBYEFIOlMD+gQ2Y3vU70522Ms6+gWVqEMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUBAf8ECzAJBgcogYxdBQECMB8GA1UdIwQYMBaAFIzujsLrazYB9YHRr/GIid/KJoomMCsGA1UdEQQkMCKCIDAxNTYtNzAtNjYtMjQxLTkwLm5ncm9rLWZyZWUuYXBwMAoGCCqGSM49BAMCA0cAMEQCICf/Uv0kSbPNB/RaNnpbeQrEh1RnBDuQ7HfYlitmiYugAiAVQ6tdywy1Q5Ib6kP09eZPBrnKsd5JHeuPjmD8jygGSw==`
  ]
  console.log(`Set certs to ${JSON.stringify(certs)}`)
  return certs
  // const logger = new BifoldLogger()
  // try {
  //   const checkedUrl = new URL(url)
  //   const response = await fetch(checkedUrl)
  //   if (!response.ok) {
  //     logger.error(`Failed to fetch trusted certificates from ${url}: ${response.statusText}`)
  //     return []
  //   }
  //   const contentType = response.headers.get('content-type') ?? ''
  //   if (!contentType.toLowerCase().includes('application/json')) {
  //     logger.error(`Invalid content type when fetching trusted certificates from ${url}: ${contentType}`)
  //     return []
  //   }
  //   const certificates = await response.json()
  //   if (!Array.isArray(certificates)) {
  //     logger.error(`Invalid response format when fetching trusted certificates from ${url}`)
  //     return []
  //   }
  //   logger.info(`Successfully fetched trusted certificates from ${url}`)
  //   return certificates.filter((cert) => typeof cert === 'string' && cert.trim().length > 0)
  // } catch (error) {
  //   logger.error(`Error fetching trusted certificates from ${url}: ${error}`)
  //   return []
  // }
}

/**
 * Constructs the modules to be used in the agent setup
 * @param indyNetworks
 * @param mediatorInvitationUrl determine which mediator to use
 * @param txnCache optional local cache config for indyvdr
 * @param trustedCertificates optional array of trusted certificates for X509 module
 * @returns modules to be used in agent setup
 */
export function getAgentModules({ 
  indyNetworks, 
  mediatorInvitationUrl, 
  txnCache, 
  trustedCertificates = [] 
}: GetAgentModulesOptions) {
  const indyCredentialFormat = new LegacyIndyDidCommCredentialFormatService()
  const indyProofFormat = new LegacyIndyDidCommProofFormatService()

  if (txnCache) {
    // TODO: Not a function?
    // indyVdr.setLedgerTxnCache({
    //   capacity: txnCache.capacity,
    //   expiry_offset_ms: txnCache.expiryOffsetMs,
    //   path: txnCache.path,
    // })
  }

  const askarStoreValue = 'bifoldAskar';

  return {
    askar: new AskarModule({
      askar,
      store: { id: askarStoreValue, key: askarStoreValue },
    }),
    anoncreds: new AnonCredsModule({
      anoncreds,
      registries: [new IndyVdrAnonCredsRegistry(), new WebVhAnonCredsRegistry()],
    }),
    indyVdr: new IndyVdrModule({
      indyVdr,
      networks: indyNetworks as [IndyVdrPoolConfig],
    }),
    didcomm: new DidCommModule({
      useDidSovPrefixWhereAllowed: true,
      connections: {
        autoAcceptConnections: true,
      },
      credentials: {
        autoAcceptCredentials: DidCommAutoAcceptCredential.ContentApproved,
        credentialProtocols: [
          new DidCommCredentialV1Protocol({ indyCredentialFormat }),
          new DidCommCredentialV2Protocol({
            credentialFormats: [
              indyCredentialFormat,
              new AnonCredsDidCommCredentialFormatService(),
              new DataIntegrityDidCommCredentialFormatService(),
            ],
          }),
        ],
      },
      proofs: {
        autoAcceptProofs: DidCommAutoAcceptProof.ContentApproved,
        proofProtocols: [
          new DidCommProofV1Protocol({ indyProofFormat }),
          new DidCommProofV2Protocol({
            proofFormats: [
              indyProofFormat,
              new AnonCredsDidCommProofFormatService(),
              new DidCommDifPresentationExchangeProofFormatService(),
            ],
          }),
        ],
      },
      mediationRecipient: {
        mediatorInvitationUrl: mediatorInvitationUrl,
        mediatorPickupStrategy: DidCommMediatorPickupStrategy.Implicit,
      },
    }),
    openid4vc: new OpenId4VcModule(),
    dids: new DidsModule({
      resolvers: [
        new WebVhDidResolver(),
        new WebDidResolver(),
        new JwkDidResolver(),
        new KeyDidResolver(),
        new PeerDidResolver(),
      ],
    }),
     ...(trustedCertificates.length > 0
      ? {
          x509: new X509Module({
            trustedCertificates: trustedCertificates as [string, ...string[]],
          }),
        }
      : {}),
  }
}

/**
 * Fetches and prepares agent modules with trusted certificates from remote API
 * @param options Agent module options including indyNetworks, mediatorInvitationUrl, txnCache
 * @param trustedCertificatesUrl Optional URL to fetch trusted certificates from
 * @returns Promise resolving to agent modules
 */
export async function getAgentModulesWithCertificates(
  options: Omit<GetAgentModulesOptions, 'trustedCertificates'>,
  trustedCertificatesUrl?: string
) {
  const trustedCertificates = trustedCertificatesUrl ? await fetchTrustedCertificates(trustedCertificatesUrl) : []
  console.log(`Fetched trusted certificates: ${JSON.stringify(trustedCertificates)}`)
  return getAgentModules({
    ...options,
    trustedCertificates,
  })
}

interface MyAgentContextInterface {
  loading: boolean
  agent: BifoldAgent
}

export const useAppAgent = useAgent as () => MyAgentContextInterface

export const createLinkSecretIfRequired = async (agent: BifoldAgent) => {
  // If we don't have any link secrets yet, we will create a
  // default link secret that will be used for all anoncreds
  // credential requests.
  const linkSecretIds = await agent.modules.anoncreds.getLinkSecretIds()
  if (linkSecretIds.length === 0) {
    await agent.modules.anoncreds.createLinkSecret({
      setAsDefault: true,
    })
  }
}
