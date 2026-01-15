import { Agent, JsonEncoder } from '@credo-ts/core'
import { DidCommMediationRecord, DidCommOutOfBandInvitation } from '@credo-ts/didcomm'
import queryString from 'query-string'

/**
 * Workaround for class-transformer @Expose decorator not working properly in React Native
 * Manually maps @id and @type to id and type properties
 */
const fixInvitationProperties = (invitation: any): void => {
  if (invitation && typeof invitation === 'object') {
    // Map @id to id if id is missing
    if (!invitation.id && invitation['@id']) {
      invitation.id = invitation['@id']
    }
    // Map @type to type if type is missing
    if (!invitation.type && invitation['@type']) {
      invitation.type = invitation['@type']
    }
    // Also fix services if they have the same issue
    if (Array.isArray(invitation.services)) {
      invitation.services.forEach((service: any) => {
        if (service && typeof service === 'object') {
          if (!service.id && service['@id']) {
            service.id = service['@id']
          }
          if (!service.type && service['@type']) {
            service.type = service['@type']
          }
        }
      })
    }
  }
}

export const isMediatorInvitation = async (agent: Agent, url: string): Promise<boolean> => {
  try {
    agent.config.logger.debug(`[DEBUG] Parsing invitation URL: ${url}`)
    
    // Parse the URL to get the invitation JSON before class-transformer processes it
    const parsedUrl = queryString.parseUrl(url).query
    const encodedInvitation = parsedUrl.oob ?? parsedUrl.c_i ?? parsedUrl.d_m
    
    if (typeof encodedInvitation === 'string') {
      const invitationJson = JsonEncoder.fromBase64(encodedInvitation as string)
      agent.config.logger.debug(`[DEBUG] Raw invitation JSON: ${JSON.stringify(invitationJson, null, 2)}`)
    }
    
    const invitation = await agent.modules.oob.parseInvitation(url)
    
    // Apply workaround
    fixInvitationProperties(invitation)
    
    if (!invitation) {
      return false
    }

    agent.config.logger.debug(`[DEBUG] Parsed invitation ID: ${invitation.id}`)
    agent.config.logger.debug(`[DEBUG] Invitation keys: ${Object.keys(invitation).join(', ')}`)
    
    // Check if id property exists
    if (!invitation.id) {
      agent.config.logger.error(`[DEBUG] Invitation.id is STILL undefined after fix! Full object: ${JSON.stringify(invitation, null, 2)}`)
    }

    if (invitation.goalCode === 'aries.vc.mediate') {
      agent.config.logger.info(`Invitation is a mediator invitation with goal code: ${invitation.goalCode}`)
      return true
    }

    return false
  } catch (error) {
    agent.config.logger.error(`Invitation is not a mediator invitation.`, error as Error)
    return false
  }
}

const provisionMediationRecordFromMediatorUrl = async (
  agent: Agent,
  url: string
): Promise<DidCommMediationRecord | undefined> => {
  try {
    const invitation = await agent.modules.oob.parseInvitation(url)
    fixInvitationProperties(invitation)
    
    if (!invitation) {
      agent.config.logger.error(`No invitation found in URL: ${url}`)
      return undefined
    }

    const outOfBandRecord = await agent.modules.oob.findByReceivedInvitationId(invitation.id)
    let [connection] = outOfBandRecord ? await agent.modules.connections.findAllByOutOfBandId(outOfBandRecord.id) : []

    if (!connection) {
      agent.config.logger.warn(`No connection found for out-of-band record: ${outOfBandRecord?.id}`)
      const invite = await agent.modules.oob.parseInvitation(url)
      fixInvitationProperties(invite)
      const { connectionRecord: newConnection } = await agent.modules.oob.receiveInvitation(invite)

      if (!newConnection) {
        agent.config.logger.error(`Failed to create connection from invitation: ${JSON.stringify(invite, null, 2)}`)
        return
      }
      connection = newConnection
    }

    const result = connection.isReady ? connection : await agent.modules.connections.returnWhenIsConnected(connection.id)
    return agent.modules.mediationRecipient.provision(result)
  } catch (error) {
    agent.config.logger.error(`Failed to get connection ID from mediator URL: ${error}`)
    return
  }
}

export const setMediationToDefault = async (agent: Agent, mediatorUrl: string) => {
  const mediationRecord = await provisionMediationRecordFromMediatorUrl(agent, mediatorUrl)
  if (!mediationRecord) {
    agent.config.logger.error(`No connection record found for mediator URL: ${mediatorUrl}`)
    return
  }

  const currentDefault = await agent.modules.mediationRecipient.findDefaultMediator()
  if (currentDefault?.connectionId === mediationRecord.id) {
    agent.config.logger.info(`Default mediator already set for connection ID: ${mediationRecord.id}`)
    return
  }

  await agent.modules.mediationRecipient.setDefaultMediator(mediationRecord)
  agent.config.logger.info(`setting default mediator with record: ${JSON.stringify(mediationRecord)}`)
}
