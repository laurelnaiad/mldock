# mldock
[![npm](https://img.shields.io/npm/v/mldock.svg)](https://www.npmjs.com/package/mldock)
[![Travis](https://img.shields.io/travis/laurelnaiad/mldock/master.svg)](https://travis-ci.org/laurelnaiad/mldock)
[![Codecov](https://img.shields.io/codecov/c/github/laurelnaiad/mldock/master.svg)](https://codecov.io/gh/laurelnaiad/mldock)
[![Greenkeeper badge](https://badges.greenkeeper.io/laurelnaiad/mldock.svg)](https://greenkeeper.io/)
---
> NodeJS/TypeScript library/CLI -- downloads MarkLogic rpms and builds Docker images hosting MarkLogic Server 8+

## Description

_mldock_ was conceived as a means of building Docker images to host MarkLogic Server in a repeatable manner, so that other systems don't suffer headaches developing/testing such a heavyweight operation.

mldock:

* downloads MarkLogic .rpm files from MarkLogic using the developer credentials you bring;
* builds Docker images that run MarkLogic Server;
* helps run image as containers.

It does very little beyond that, but to allow for substitution of fancier baselines _underneath_ the MarkLogic image.

## Installation

Prerequisites:
* NodeJS 10.15.3+
* Docker Engine 17.06+
* a free [MarkLogic Developer Account](https://developer.marklogic.com/people/signup)

```bash
npm install -g mldock # (local installs are fine, too)
```

`mldock -h` gives help for the command-line interface, and see typings for the barest of library api assistance.

## Usage

### The `mldock` cli:

Download/build image in one step:
```bash
mldock build -r my-ml-proj -e $MLDEV_USER -p $MLDEV_PW 8.0-6.4
# => ...(a rolling log ensues and lasts a while)
#
# my-ml-proj-marklogic:8.0.6.4
```

Or seperately:
```bash
mldock download -e $MLDEV_USER -p $MLDEV_PW -d ./downloaded 8.0-6.4
# => ...(a rolling log ensues and lasts a while)
# downloading version 8.0-6.4 to ./downloaded  ...done
#
# <PWD>/downloaded/MarkLogic-RHEL7-8.0-6.4.x86_64.rpm

mldock build -r my-ml-proj -f downloaded/MarkLogic-RHEL7-8.0-6.4.x86_64.rpm 8.0-6.4
# => ...(a rolling log ensues and lasts a while)
# preparing centos7-compat...done.
# building centos7-compat...done.
# preparing MarkLogic 8.0-6.4...done.
# building MarkLogic 8.0-6.4....done.
#
# my-ml-proj-marklogic:8.0.6.4
```

Or do it all:
```bash
mldock run --n my-container -e $MLDEV_USER -p $MLDEV_PW 8.0-6.4
```

### The `MlDock` class:

```typescript
import {
  MlDock,
} from 'mldock'

const creds = {
  email: process.env.MLDEV_USER,
  password: process.env.MLDEV_PW
}

/**
 * This example downloads the requisite .rpm file from developer.marklogic.com using the
 * given credentials.
 */
const mldock = new MlDock({ repo: 'my-ml-proj' })
mldock.buildVersion({
  version: '9.0-2',
  rpmSource: creds
}).then((imageName) => {
  console.log(`built ${imageName}`)
  // => built my-ml-proj-marklogic:9.0.2
})
```

The workhorse of mldock is MlDockClient, which itself extends [apocas/dockerode](https://github.com/apocas/dockerode). Docker-related options for MlDock are specified as Dockerode options in the 2nd (optional) MlDock constructor parameter.

```typescript
import {
  MlDock,
} from 'mldock'

/* instantiate MlDock to operate on `ml-ml-proj` on `my-docker-host` host. */
const mldock = new MlDock(
  { repo: 'my-ml-proj' },
  { host: 'my-docker-host', port: 2375 }
)

/* the `.client` property exposes the MlDockClient/Dockerode instance. */
mldock.client.createContainer({
  // ...
})
mldock.client.getEvents({
  // ...
})
```

In order to follow progress of long operations, pass a "progress follower".

The unit tests use this one, which writes everything to the console (the cli uses a rolling logs implementation which is also exported):

```typescript
import {
  defaultFollower,
  MlDock,
} from 'mldock'

mldock.buildVersion({
  version: '8.0-6.4',
  rpmSource: creds,
  progressFollower: defaultFollower
}).then((imageName) => {
  //...
})
```

There are a few functions on the library to start containers.
Of particular note may be the `startHostHealthy` function.

The unit tests use this to ensure images are functional.

```typescript
const version = new MlVersion('8.0-6.4')
const oneSecondInNano = 1000 * 1000000

mldock.buildVersion(version, creds, defaultFollower)
.then((imageName) => mldock.createHostContainer({
  version,
  healthCheck: {
    Test: [
      'CMD-SHELL',
      `curl --silent --fail http://localhost:8001/admin/v1/timestamp || exit 1`
    ],
    Interval: oneSecondInNano,
    Timeout: oneSecondInNano,
    Retries: 12,
    StartPeriod: oneSecondInNano
  }
})
.then((container) => mldock.startHostHealthy(container.id!, 10, defaultFollower))
/* the server is up and running now. */
.then((container) => mldock.hostInspect(container.id!))
.then((containerRuntime) => {
  console.log(JSON.stringify(containerRuntime.ports))
  // => print something like the following, where the high port numbers are the
  //      externally mapped ports for the standard marklogic ports
  // { '8000': 39472, '8001': 38497, '8002': 38434 }
})
```

The `runHost` function is quite similar to `buildVersion`, except:

* the container needs a name
* the concept of "overwriting" the image is out -- instead of the image or a
container by the given name exists, it's used

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
