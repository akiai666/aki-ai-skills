import sharp from 'sharp'
const video = process.argv.includes('--video')
const commands = ['zip', 'unzip', ...(video ? ['ffmpeg', 'ffprobe'] : [])]
const missing = commands.filter(cmd => !Bun.which(cmd))
console.log(JSON.stringify({ bun: Bun.version, sharp: sharp.versions.sharp, video, missing, generation: 'Agent must discover imagegen and verify GPT Image 2 access with a real request; credentials are not inspected.' }, null, 2))
if (missing.length) process.exitCode = 1
