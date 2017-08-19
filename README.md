# mldock
> a NodeJS/Typescript library and cli to download MarkLogic rpms and build docker images hosting MarkLogic Server 8+.

## Description

mldock is intended to create images to serve as a baselines for building more interesting and useful MarkLogic-hosting docker containers. As such, it does two things:

* it downloads MarkLogic rpms from MarkLogic using the developer credentials you bring;
* it builds images that run MarkLogic.

It does very little beyond that, but to allow for to substitution of fancier baselines _underneath_ the MarkLogic image.

## Status

This is pre-alpha software. The api is entirely unfrozen (8/20/2017). That said, this builder is meant to serve as a baseline for other things, and so it may have reached its terminal feature set, give or take some knobs and dials.

## Installation

Prerequisites:
* NodeJS 6.5+
* docker-related commands require that the shell in whih they're run is configured for some docker host. Installing Docker for Mac or Docker for Windows, is thus, sufficient.
* (docker is _not_ needed just to download .rpms.)

```bash
npm install mldock # can be also be global
```

`mldock -h` gives help for the command-line interface, and see typings for the barest of library api assistance.

## Usage

### The mldock cli:

Download/build image in one step:
```bash
mldock build -r my-ml-proj -e $MARKLOGIC_DEV_USER -p $MARKLOGIC_DEV_PASSWORD 8.0-6.4
# => ...(a rolling log ensues and lasts a while)
# => my-ml-proj-marklogic:8.0.6.4
```

Or seperately:
```bash
mldock download -e $MARKLOGIC_DEV_USER -p $MARKLOGIC_DEV_PASSWORD -d ./downloaded 8.0-6.4
# => ...(a rolling log ensues and lasts a while)
# => <PWD>/downloaded/MarkLogic-RHEL7-8.0-6.4.x86_64.rpm
mldock build -r my-ml-proj -f downloaded/MarkLogic-RHEL7-8.0-6.4.x86_64.rpm 8.0-6.4
# => ...(a rolling log ensues and lasts a while)
# => my-ml-proj-marklogic:8.0.6.4
```

### The MlDock class:

```typescript
import {
  MlDock,
} from 'mldock'

const creds = {
  email: process.env.MARKLOGIC_DEV_USER,
  password: process.env.MARKLOGIC_DEV_PASSWORD
}

/**
 * This example downloads the requisite .rpm file from developer.marklogic.com using the
 * given credentials.
 */
const mldock = new MlDock({ repo: 'my-ml-proj' })
mldock.buildVersion('9.0-2', creds).then((imageName) => {
  console.log(`built ${imageName}`)
})
// => installed my-ml-proj-marklogic:9.0.2
```

The workhorse of mldock is MlDockClient, which itself extends [apocas/dockerode](https://github.com/apocas/dockerode). Docker-related options for MlDock are specified as Dockerode options in the 2nd (optional) MlDock constructor parameter.

```typescript
import {
  MlDock,
} from 'mldock'

// instantiate MlDock to operate on `ml-ml-proj` on `my-docker-host` host.
const mldock = new MlDock(
  { repo: 'my-ml-proj' },
  { host: 'my-docker-host', port: 2375 }
)

// the `.client` property exposes the MlDockClient/Dockerode instance.
mldock.client.createContainer({
  // ...
})
// etc...
```

In order to follow progress of long operations, pass a "progress follower".

The unit tests use this one, which writes everything to the console (the cli uses a rolling logs implementation which is also exported):

```typescript
import {
  defaultFollower,
  MlDock,
} from 'mldock'

mldock.buildVersion('8.0-6.4', creds, defaultFollower).then((imageName) => {
  //...
})
```

## Images

Seperation of images by repository-prefix allows for different base operating systems or other platform customizations to co-exist in the same docker host.

In addition to pulling the base operating system image (centos6 or centos7 by default), the following are created:

* \`${repo-prefix}-os\`: this is the base operating system + MarkLogic dependencies
* \`${repo-prefix}-marklogic\`: MarkLogic Server on top of the the \`-os\` image

Naturally, all the MarkLogic images share their associated OS image base For later 8.0.x releases of MarkLogic which can run on 6 or 7, Centos7 is used as the base.

One may wish to build production images from RHEL rather than CentOS, and/or to tweak the heck out of the operating system generally or do something strange. In such cases, the default base image may be overridden in order to supply some other image which is compatible with the expected CentOS version, e.g.

```bash
mldock build -f MarkLogic.rpm --base my-customized-rhel-image 9.0-2
```

Note that the image specified as `base` replaces  \`centos:centos6\` or \`centos:centos7\` in the image stack -- a customized \`${repo-prefix}-os\` image will still be built on top of that which is given as the `base` in order to maintain an otherwise consistent image stack.

In addition to MarkLogic Server, the following is installed in the `MarkLogic` image:

* `/usr/local/bin/mlrun.sh`: runner/signal trap for the containerized MarkLogic Server instance

The /var/opt/MarkLogic directory is marked as a volume and left in uninitialized state.

## Contributing

Contributing is very welcome.

## License

MIT License.
