import { proto } from '../../../WAProto/index.js'
import { generateWAMessageContent } from '../../Utils/messages'

const minimalOptions = {
	upload: async () => ({ mediaUrl: 'https://example.com/media', directPath: '/media' })
}

describe('generateWAMessageContent — interactiveMessage', () => {
	it('maps title to the interactive body and quick-reply buttons to native flow buttons', async () => {
		const result = await generateWAMessageContent(
			{
				interactiveMessage: {
					title: 'Pick one',
					buttons: [
						{ displayText: 'Yes', id: 'yes' },
						{ displayText: 'No', id: 'no' }
					]
				}
			},
			minimalOptions
		)

		expect(result.interactiveMessage).toBeDefined()
		expect(result.interactiveMessage?.body?.text).toBe('Pick one')
		expect(result.interactiveMessage?.header?.title).toBeUndefined()
		expect(result.interactiveMessage?.footer?.text).toBeUndefined()
		expect(result.interactiveMessage?.nativeFlowMessage?.buttons).toHaveLength(2)
		expect(JSON.parse(result.interactiveMessage!.nativeFlowMessage!.buttons![0]!.buttonParamsJson!)).toEqual({
			display_text: 'Yes',
			id: 'yes'
		})
	})

	it('carries header, body and footer through', async () => {
		const result = await generateWAMessageContent(
			{
				interactiveMessage: {
					header: 'Survey',
					title: 'Body text',
					body: 'Explicit body',
					footer: 'Powered by a bot',
					buttons: [{ displayText: 'Go', id: 'go' }]
				}
			},
			minimalOptions
		)

		expect(result.interactiveMessage?.header?.title).toBe('Survey')
		expect(result.interactiveMessage?.body?.text).toBe('Explicit body')
		expect(result.interactiveMessage?.footer?.text).toBe('Powered by a bot')
	})
})

describe('generateWAMessageContent — richResponse', () => {
	it('maps the rich response content to the richResponseMessage field', async () => {
		const result = await generateWAMessageContent(
			{
				richResponse: {
					messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
					submessages: [{ messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT, messageText: 'hi' }]
				}
			},
			minimalOptions
		)

		expect(result.richResponseMessage).toBeDefined()
		expect(result.richResponseMessage?.messageType).toBe(proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD)
		expect(result.richResponseMessage?.submessages?.[0]?.messageText).toBe('hi')
	})
})
