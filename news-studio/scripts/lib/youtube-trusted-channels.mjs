export const TRUSTED_YOUTUBE_CHANNELS = [
  {
    channelId: 'UCK7tptUDHh-RYDsdxO1-5QQ',
    displayName: 'The Wall Street Journal',
    aliases: ['The Wall Street Journal', 'Wall Street Journal', 'WSJ'],
  },
  {
    displayName: 'Reuters',
    aliases: ['Reuters'],
  },
  {
    displayName: 'CNBC Television',
    aliases: ['CNBC Television', 'CNBC'],
  },
  {
    displayName: 'Bloomberg Television',
    aliases: ['Bloomberg Television', 'Bloomberg'],
  },
  {
    displayName: 'Bloomberg Technology',
    aliases: ['Bloomberg Technology'],
  },
  {
    displayName: 'TechCrunch',
    aliases: ['TechCrunch'],
  },
  {
    displayName: 'The Robot Report',
    aliases: ['The Robot Report'],
  },
  {
    displayName: 'IEEE Spectrum',
    aliases: ['IEEE Spectrum'],
  },
  {
    displayName: 'Associated Press',
    aliases: ['Associated Press', 'AP', 'AP Archive'],
  },
  {
    displayName: 'Business Insider',
    aliases: ['Business Insider', 'Business Insider Today'],
  },
  {
    displayName: 'Yahoo Finance',
    aliases: ['Yahoo Finance'],
  },
  {
    displayName: 'Interesting Engineering',
    aliases: ['Interesting Engineering'],
  },
  {
    displayName: 'New Atlas',
    aliases: ['New Atlas'],
  },
]

export const TRUSTED_YOUTUBE_CHANNEL_MAP = new Map(
  TRUSTED_YOUTUBE_CHANNELS.filter((entry) => entry.channelId).map((entry) => [entry.channelId, entry])
)
