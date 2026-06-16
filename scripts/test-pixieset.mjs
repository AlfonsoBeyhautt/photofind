import { fetchPixiesetAlbum } from '../server/pixiesetService.ts'

const url = process.argv[2] ?? 'https://josevilla.pixieset.com/lilyandjonathan/highlights/'
const result = await fetchPixiesetAlbum(url)

if (result.ok) {
  console.log('OK', result.album.folderName, result.album.totalImages, 'images')
  console.log('sample', result.album.images.slice(0, 2).map((i) => ({ name: i.name, thumb: i.thumbnailUrl.slice(0, 60) })))
} else {
  console.log('FAIL', result.error)
}
