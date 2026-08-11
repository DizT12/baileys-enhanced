import type { BinaryNode } from '../../WABinary'
import { USyncContactProtocol, USyncUsernameProtocol } from '../../WAUSync/'
import { USyncLIDProtocol } from '../../WAUSync/Protocols/UsyncLIDProtocol'
import { buildUsernameQuery } from '../../WAUSync/USyncQuery'

describe('buildUsernameQuery', () => {
	it('strips the leading @ and trims whitespace from handles', () => {
		const query = buildUsernameQuery(['@john.doe', ' jane.doe ', ''])

		expect(query.users.map(u => u.username)).toEqual(['john.doe', 'jane.doe'])
	})

	it('requests the contact, username and lid protocols in order', () => {
		const query = buildUsernameQuery(['@john.doe'])

		expect(query.protocols.map(p => p.name)).toEqual(['contact', 'username', 'lid'])
	})

	it('builds an empty query when every handle is blank', () => {
		const query = buildUsernameQuery(['', '   '])

		expect(query.users).toHaveLength(0)
	})

	it('renders the handle as a contact child keyed by the username attribute', () => {
		const query = buildUsernameQuery(['@john.doe'])
		const contact = new USyncContactProtocol()
		const node = contact.getUserElement(query.users[0]!)

		expect(node).toEqual({
			tag: 'contact',
			attrs: { username: 'john.doe' }
		})
	})
})

describe('parseUSyncQueryResult for usernames', () => {
	const query = buildUsernameQuery(['@john.doe'])

	it('maps a resolved LID account to jid, username, lid and exists', () => {
		const result: BinaryNode = {
			tag: 'iq',
			attrs: { type: 'result' },
			content: [
				{
					tag: 'usync',
					content: [
						{
							tag: 'list',
							content: [
								{
									tag: 'user',
									attrs: { jid: '100000001@lid' },
									content: [
										{ tag: 'contact', attrs: { type: 'in' } },
										{ tag: 'username', content: 'john.doe' },
										{ tag: 'lid', attrs: { val: '100000001@lid' } }
									]
								}
							]
						}
					]
				}
			]
		}

		expect(query.parseUSyncQueryResult(result)).toEqual({
			list: [
				{
					contact: true,
					id: '100000001@lid',
					lid: '100000001@lid',
					username: 'john.doe'
				}
			],
			sideList: []
		})
	})

	it('keeps protocol parsers consistent with the query element tags', () => {
		const usernameProtocol = new USyncUsernameProtocol()
		const lidProtocol = new USyncLIDProtocol()

		expect(usernameProtocol.getQueryElement()).toEqual({ tag: 'username', attrs: {} })
		expect(usernameProtocol.parser({ tag: 'username', content: 'john.doe' })).toBe('john.doe')
		expect(lidProtocol.getQueryElement()).toEqual({ tag: 'lid', attrs: {} })
	})
})
