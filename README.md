# pre-bundled

A tool that pre bundles and re-publishes npm dependencies

## Goal

The goal of this module is to reduce the number of visible
dependencies in `node_modules` ; `npm ls` & `package-lock.json`
that are NOT related to production code.

`pre-bundled` solves half the problem, look at the sister
project [`npm-bin-deps`][npm-bin-deps] to solve the other half.


## Access

To add new modules to `pre-bundled` you need github & npm access
to run the binary.

If you run this command without access to github or npm then
please reach out by [opening an issue][issue] or
[send a tweet][tweet]

## Example

The `pre-bundled` binary will re-bundle a library like `rimraf`
or `tape` such that it has zero dependencies, by checking all
of the dependencies into git and into the npm tarball.

You can see a list of existing pre-bundled modules on

 - https://www.npmjs.com/org/pre-bundled
 - https://github.com/pre-bundled

To add new ones you run `pre-bundled ${module} ${version}`

If you have ever been frustrated with too many dependencies and
wish you could install more glorious zero dependency libraries
then this module is for you.

As an example, `tape` has 69 total dependencies and ends up
auditing 107 packages.

```
raynos at raynos-Precision-5530
~/optoolco/temp
$ npm i tape -D --loglevel notice
npm WARN temp@1.0.0 No description
npm WARN temp@1.0.0 No repository field.

+ tape@4.12.0
updated 1 package and audited 107 packages in 2.905s
found 0 vulnerabilities

raynos at raynos-Precision-5530
~/optoolco/temp
$ npm ls | wc -l
69
```

Of couse `@pre-bundled/tape` has one dependency and audits
exactly one dependency

```
raynos at raynos-Precision-5530
~/optoolco/temp
$ npm i @pre-bundled/tape -D
npm http fetch GET 304 https://registry.npmjs.org/@pre-bundled%2ftape 2026ms (from cache)
npm WARN temp@1.0.0 No description
npm WARN temp@1.0.0 No repository field.

npm http fetch POST 200 https://registry.npmjs.org/-/npm/v1/security/audits/quick 414ms
+ @pre-bundled/tape@4.10.2
added 1 package from 1 contributor and audited 1 package in 2.545s
found 0 vulnerabilities

raynos at raynos-Precision-5530
~/optoolco/temp
$ npm ls
temp@1.0.0 /home/raynos/optoolco/temp
└── @pre-bundled/tape@4.10.2
```

## Known caveats

Peer dependencies are **BROKEN**.

## Benefits

Imagine you have a small project with a couple of important
non-trivial production dependencies and then some test
dependencies.

For example `tape` & `rimraf` ; Just these two simple dependencies
add quite a lot of weight to your project ( 70 extra dependencies )

```
raynos at raynos-Precision-5530
~/projects/fake-cloudwatch-logs on npr*
$ cat package-lock.json | wc -l
485
raynos at raynos-Precision-5530
~/projects/fake-cloudwatch-logs on npr*
$ npm ls | wc -l
91
raynos at raynos-Precision-5530
~/projects/fake-cloudwatch-logs on npr*
$ ls node_modules/ | wc -l
57
```

God forbid you install a larger dependency like `jest` which adds
350 deps or `tap` which adds 250 deps.

By using `@pre-bundled/tape` & `@pre-bundled/rimraf` you can
install any dependency as if its a micro zero dependency library.

```
raynos at raynos-Precision-5530
~/projects/fake-cloudwatch-logs on npr
$ cat package-lock.json | wc -l
146
raynos at raynos-Precision-5530
~/projects/fake-cloudwatch-logs on npr
$ npm ls | wc -l
24
raynos at raynos-Precision-5530
~/projects/fake-cloudwatch-logs on npr
$ ls node_modules/ | wc -l
18
```

Your dependency count is now tiny, if you look at the actual
output of `npm ls` you can see

```
raynos at raynos-Precision-5530
~/projects/fake-cloudwatch-logs on npr
$ npm ls
fake-cloudwatch-logs@1.2.0 /home/raynos/projects/fake-cloudwatch-logs
├── @pre-bundled/rimraf@3.0.0
├── @pre-bundled/tape@4.10.2
├── @types/node@12.0.2
├─┬ aws-sdk@2.549.0
│ ├─┬ buffer@4.9.1
│ │ ├── base64-js@1.3.1
│ │ ├── ieee754@1.1.13 deduped
│ │ └── isarray@1.0.0
│ ├── events@1.1.1
│ ├── ieee754@1.1.13
│ ├── jmespath@0.15.0
│ ├── querystring@0.2.0
│ ├── sax@1.2.1
│ ├─┬ url@0.10.3
│ │ ├── punycode@1.3.2
│ │ └── querystring@0.2.0 deduped
│ ├── uuid@3.3.2
│ └─┬ xml2js@0.4.19
│   ├── sax@1.2.1 deduped
│   └── xmlbuilder@9.0.7
├── npm-bin-deps@1.3.0
└── tape-cluster@3.2.1
```

You can now see all of your important production dependencies from
`aws-sdk` and the extra dependencies like `tape` & `rimraf` dont
take up any mental space or physical space.

## Docs :

```sh
$ pre-bundled -h
pre-bundled {module} {version}
This tool re-bundles a module and publishes
  It to both github & npm for pre-bundled

  module: NPM module name
  version: Version you want to bundle

To run this tool you need access to NPM & github
Ask @Raynos on twitter


  --dry Run it in dry mode ( no publish )
  --publishSuffix set a suffic for publishing
```

## install

```
% npm install pre-bundled -g
```

## MIT Licensed

  [npm-bin-deps]: https://github.com/Raynos/npm-bin-deps
  [issue]: https://github.com/Raynos/pre-bundled/issues/new
  [tweet]: https://twitter.com/Raynos
