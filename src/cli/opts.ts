export const repo = [
  '-r, --repo <repository prefix>',
  'Prefix to use in naming images/containers in docker; defaults to \`mldock\`',
  'mldock'
]
export const rpmFile = [
  '-f, --rpmFile <path to rpm file>',
  'Build the specified MarkLogic .rpm file into an image.',
]
export const email = [
  '-e, --email <email address>',
  'Email address of MarkLogic Developer account for downloading .rpm files'
]
export const password = [
  '-p, --password <password>',
  'Password to use downloading MarkLogic .rpm files'
]
export const overwriteImage = [
  '-o, --overwrite',
  'Overwrite existing image the MarkLogic version, if present',
]
export const version = [
  '-v, --version <version>',
  'Version of MarkLogic; the version must already be present in the repository',
]
export const downloadDir = [
  '-d, --dir <relative directory>',
  'Directory into which to download the .rpm file',
]
export const overwriteFile = [
  '-o, --overwrite',
  'Overwrite existing file, if present',
]
export const baseImage = [
  '-b, --base <image name or id>',
  'Substitute base image in place of CentOS official image',
]
export const containerName = [
  '-n, --contName <container name>',
  'Name of the host container.',
]
export const hostHealthyTime = [
  '-h, --hhTime <timeout seconds>',
  'Time in seconds to wait for host to become healthy',
]
