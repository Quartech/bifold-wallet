import {
  AnonCredsCredentialFormatService,
  AnonCredsModule,
  AnonCredsProofFormatService,
  DataIntegrityCredentialFormatService,
  LegacyIndyCredentialFormatService,
  LegacyIndyProofFormatService,
  V1CredentialProtocol,
  V1ProofProtocol,
} from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import {
  Agent,
  AutoAcceptCredential,
  AutoAcceptProof,
  ConnectionsModule,
  CredentialsModule,
  DidsModule,
  DifPresentationExchangeProofFormatService,
  JwkDidResolver,
  KeyDidResolver,
  MediationRecipientModule,
  MediatorPickupStrategy,
  PeerDidResolver,
  ProofsModule,
  V2CredentialProtocol,
  V2ProofProtocol,
  WebDidResolver,
  X509Module,
} from '@credo-ts/core'
import { IndyVdrAnonCredsRegistry, IndyVdrModule, IndyVdrPoolConfig } from '@credo-ts/indy-vdr'
import { OpenId4VcHolderModule } from '@credo-ts/openid4vc'
import { PushNotificationsApnsModule, PushNotificationsFcmModule } from '@credo-ts/push-notifications'
import { WebVhAnonCredsRegistry, WebvhDidResolver } from '@credo-ts/webvh'
import { useAgent } from '@bifold/react-hooks'
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

export type BifoldAgent = Agent<ReturnType<typeof getAgentModules>>

/**
 * Fetches trusted certificates from a remote API
 * @param url The API endpoint URL
 * @returns Array of certificate strings
 */
async function fetchTrustedCertificates(url: string): Promise<string[]> {
  const logger = new BifoldLogger()
  try {
    const checkedUrl = new URL(url)
    const response = await fetch(checkedUrl)
    if (!response.ok) {
      logger.error(`Failed to fetch trusted certificates from ${url}: ${response.statusText}`)
      return []
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      logger.error(`Invalid content type when fetching trusted certificates from ${url}: ${contentType}`)
      return []
    }
    const certificates = await response.json()
    if (!Array.isArray(certificates)) {
      logger.error(`Invalid response format when fetching trusted certificates from ${url}`)
      return []
    }
    logger.info(`Successfully fetched trusted certificates from ${url}`)
    return certificates.filter((cert) => typeof cert === 'string' && cert.trim().length > 0)
  } catch (error) {
    logger.error(`Error fetching trusted certificates from ${url}: ${error}`)
    return []
  }
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
  const indyCredentialFormat = new LegacyIndyCredentialFormatService()
  const indyProofFormat = new LegacyIndyProofFormatService()

  if (txnCache) {
    indyVdr.setLedgerTxnCache({
      capacity: txnCache.capacity,
      expiry_offset_ms: txnCache.expiryOffsetMs,
      path: txnCache.path,
    })
  }

  return {
    askar: new AskarModule({
      ariesAskar: askar,
    }),
    anoncreds: new AnonCredsModule({
      anoncreds,
      registries: [new IndyVdrAnonCredsRegistry(), new WebVhAnonCredsRegistry()],
    }),
    indyVdr: new IndyVdrModule({
      indyVdr,
      networks: indyNetworks as [IndyVdrPoolConfig],
    }),
    connections: new ConnectionsModule({
      autoAcceptConnections: true,
    }),
    credentials: new CredentialsModule({
      autoAcceptCredentials: AutoAcceptCredential.ContentApproved,
      credentialProtocols: [
        new V1CredentialProtocol({ indyCredentialFormat }),
        new V2CredentialProtocol({
          credentialFormats: [
            indyCredentialFormat,
            new AnonCredsCredentialFormatService(),
            new DataIntegrityCredentialFormatService(),
          ],
        }),
      ],
    }),
    proofs: new ProofsModule({
      autoAcceptProofs: AutoAcceptProof.ContentApproved,
      proofProtocols: [
        new V1ProofProtocol({ indyProofFormat }),
        new V2ProofProtocol({
          proofFormats: [
            indyProofFormat,
            new AnonCredsProofFormatService(),
            new DifPresentationExchangeProofFormatService(),
          ],
        }),
      ],
    }),
    mediationRecipient: new MediationRecipientModule({
      mediatorInvitationUrl: mediatorInvitationUrl,
      mediatorPickupStrategy: MediatorPickupStrategy.Implicit,
    }),
    pushNotificationsFcm: new PushNotificationsFcmModule(),
    pushNotificationsApns: new PushNotificationsApnsModule(),
    openId4VcHolder: new OpenId4VcHolderModule(),
    dids: new DidsModule({
      resolvers: [
        new WebvhDidResolver(),
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

export const createLinkSecretIfRequired = async (agent: Agent) => {
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
