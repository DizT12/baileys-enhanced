import { proto } from '../../../WAProto/index.js'

describe('proto.ContextInfo.StatusAudienceMetadata', () => {
	it('encodes and decodes a custom-list audience with name and emoji', () => {
		const original = proto.ContextInfo.fromObject({
			statusAudienceMetadata: {
				audienceType: proto.ContextInfo.StatusAudienceMetadata.AudienceType.CUSTOM_LIST,
				listName: 'Favorites',
				listEmoji: '💚'
			}
		})

		const encoded = proto.ContextInfo.encode(original).finish()
		const decoded = proto.ContextInfo.decode(encoded)
		const metadata = decoded.statusAudienceMetadata

		expect(metadata?.audienceType).toBe(
			proto.ContextInfo.StatusAudienceMetadata.AudienceType.CUSTOM_LIST
		)
		expect(metadata?.listName).toBe('Favorites')
		expect(metadata?.listEmoji).toBe('💚')
	})

	it('exposes the AudienceType enum values used by status audience metadata', () => {
		expect(proto.ContextInfo.StatusAudienceMetadata.AudienceType.UNKNOWN).toBe(0)
		expect(proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS).toBe(1)
		expect(proto.ContextInfo.StatusAudienceMetadata.AudienceType.CUSTOM_LIST).toBe(2)
	})

	it('carries status audience metadata inside a group status v2 message', () => {
		const original = proto.Message.fromObject({
			groupStatusMessageV2: {
				message: {
					extendedTextMessage: {
						text: 'community update',
						contextInfo: {
							statusAudienceMetadata: {
								audienceType:
									proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS
							}
						}
					}
				}
			}
		})

		const encoded = proto.Message.encode(original).finish()
		const decoded = proto.Message.decode(encoded)

		expect(
			decoded.groupStatusMessageV2?.message?.extendedTextMessage?.contextInfo
				?.statusAudienceMetadata?.audienceType
		).toBe(proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS)
	})
})
