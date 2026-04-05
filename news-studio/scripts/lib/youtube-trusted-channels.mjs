export const TRUSTED_YOUTUBE_CHANNELS = [
  {
    channelId: 'UCK7tptUDHh-RYDsdxO1-5QQ',
    displayName: 'The Wall Street Journal',
    aliases: ['The Wall Street Journal', 'Wall Street Journal', 'WSJ'],
  },
]

export const TRUSTED_YOUTUBE_CHANNEL_MAP = new Map(
  TRUSTED_YOUTUBE_CHANNELS.map((entry) => [entry.channelId, entry])
)
