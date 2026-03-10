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
  const certs =  [`MIIBkjCCATigAwIBAgIRAJNhhcA+hd52XGxDnWcvIiswCgYIKoZIzj0EAwIwJjEXMBUGA1UEAxMOQ3JlZG8gbURMIElBQ0ExCzAJBgNVBAYTAlVTMCAXDTAwMDEwMTAwMDAwMFoYDzIwNTAwMTAxMDAwMDAwWjAmMRcwFQYDVQQDEw5DcmVkbyBtREwgSUFDQTELMAkGA1UEBhMCVVMwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARzgMLb5upcLx2tAFqtXoATIZcAKqcfT9XDg9uAgtWqNYW8S1ju4uj7RcQCF10ipZxBfjiInEXwhqoWp1tXd3BFo0UwQzAdBgNVHQ4EFgQUjO6OwutrNgH1gdGv8YiJ38omiiYwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB/wQIMAYBAf8CAQAwCgYIKoZIzj0EAwIDSAAwRQIhAMDBCRs6kS9kG91CwyfYRQcK2mt+o/ZIhA3C6aN7tQ2AAiAlCjT9ImS/IAc3lcBP8/gzo1+/vlcoMy2M5iN0WxUo4g==`]
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
