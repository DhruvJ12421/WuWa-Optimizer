export async function readScreenshot(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG, or WebP screenshot.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Screenshot must be smaller than 20 MB.')
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The screenshot could not be read.')); reader.readAsDataURL(file)
  })
}

