import { captureSourceDataUrl } from '../frame'

export async function requestScreenSource() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is not supported in this browser.')
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 8, max: 12 } }, audio: false })
}

export function captureScreenFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return
  return captureSourceDataUrl(video, video.videoWidth, video.videoHeight, .9)
}

export function stopScreenSource(stream: MediaStream) { stream.getTracks().forEach((track) => track.stop()) }

