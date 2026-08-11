import type { BinaryNode } from '../WABinary'
import { USyncUser } from '../WAUSync'

/**
 * Defines the interface for a USyncQuery protocol
 */
export interface USyncQueryProtocol {
	/**
	 * The name of the protocol
	 */
	name: string
	/**
	 * Defines what goes inside the query part of a USyncQuery
	 */
	getQueryElement: () => BinaryNode
	/**
	 * Defines what goes inside the user part of a USyncQuery
	 */
	getUserElement: (user: USyncUser) => BinaryNode | null

	/**
	 * Parse the result of the query
	 * @param data Data from the result
	 * @returns Whatever the protocol is supposed to return
	 */
	parser: (data: BinaryNode) => unknown
}

/**
 * Result of resolving a WhatsApp username (@handle) to a chat address.
 * `jid` is LID-preferring when the account hides its phone number, which keeps
 * routing and identity stable when a username replaces the phone number.
 */
export type UsernameQueryResult = {
	/** resolved chat address — LID jid (@lid) when the account has no public phone number, otherwise a user jid (@s.whatsapp.net) */
	jid: string
	/** the username as echoed back by WA, without the leading `@` */
	username?: string
	/** LID mapping of the resolved user, when WA returned one */
	lid?: string
	/** whether the username resolved to an existing WA account */
	exists: boolean
}
