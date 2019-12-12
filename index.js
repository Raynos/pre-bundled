#!/usr/bin/env node
'use strict'

const exec = require('child_process').execSync
const os = require('os')
const path = require('path')
const fs = require('fs')

const minimist = require('minimist')
const mkdirp = require('mkdirp').sync
const rimraf = require('rimraf').sync

async function main () {
  const args = minimist(process.argv.slice(2))

  if (args.h || args.help || !args._[0]) {
    console.log('pre-bundled {module} {version}')
    console.log('This tool re-bundles a module and publishes')
    console.log('  It to both github & npm for pre-bundled')
    console.log('  ')
    console.log('  module: NPM module name')
    console.log('  version: Version you want to bundle')
    console.log()
    console.log('To run this tool you need access to NPM & github')
    console.log('Ask @Raynos on twitter')
    return process.exit(0)
  }

  const moduleToBundle = args._[0]
  const moduleVersion = args._[1]
  if (!moduleToBundle) {
    console.error('Must specify module to bundle')
    console.error('pre-bundled {module}')
    return process.exit(1)
  }

  const whichOut = exec('which hub').toString('utf8')
  if (whichOut.length === 0) {
    console.error('Requires global installation of hub')
    return process.exit(1)
  }

  const targetDir = path.join(
    os.homedir(), '.config', 'pre-bundled'
  )
  mkdirp(targetDir)

  const npmInfo = exec(
    `npm info ${moduleToBundle} repository.url`
  ).toString('utf8').trim()
  if (!npmInfo || npmInfo.indexOf('git') !== 0) {
    console.error('NPM dependency is not git based.')
    console.log('npm info repository.url', npmInfo)
    return process.exit(1)
  }

  const githubIndex = npmInfo.indexOf('github.com')
  let githubName = npmInfo.slice(githubIndex, npmInfo.length)
  if (githubName.endsWith('.git')) {
    githubName = githubName.slice(0, githubName.length - 4)
  }
  if (githubName.startsWith('github.com/')) {
    githubName = githubName.slice(11, githubName.length)
  }

  const uriSafeModuleName = encodeURIComponent(moduleToBundle)
  const gitTargetDir = path.join(
    targetDir, uriSafeModuleName
  )
  rimraf(gitTargetDir)
  console.log(`Cloning ${githubName} ${gitTargetDir}`)
  exec(`hub clone ${githubName} ${gitTargetDir}`)

  exec(`hub fork --org=pre-bundled`, {
    cwd: gitTargetDir
  })

  let version = moduleVersion
  if (!moduleVersion) {
    const packageJSON = fs.readFileSync(
      path.join(gitTargetDir, 'package.json'), 'utf8'
    )
    const pkg = JSON.parse(packageJSON)
    version = pkg.version
  }

  const tagList = exec(`git tag -l`, {
    cwd: gitTargetDir
  }).toString('utf8')

  let checkoutTarget = `v${version}`

  /**
   * The author of ${module} does not tag their git tags ...
   */
  if (tagList.indexOf(`v${version}`) === -1) {
    const gitLog = exec(
      `git log --no-decorate --patch package.json`, {
        cwd: gitTargetDir
      }
    ).toString('utf8')

    const lines = gitLog.split('\n')
    const lineIndex = lines.findIndex((line) => {
      return line.includes(`+  "version": "${version}",`)
    })
    console.log('found lineIndex', lineIndex)

    for (let i = lineIndex; i >= 0; i--) {
      const logLine = lines[i].trim()

      if (logLine.match(/^commit [0-9a-f]{40}$/)) {
        const commitSha = logLine.slice(7, logLine.length)
        checkoutTarget = commitSha
        break
      }
    }
  }

  exec(`git checkout ${checkoutTarget}`, {
    cwd: gitTargetDir
  })
  exec(`git checkout -b pre-bundled-${version}`, {
    cwd: gitTargetDir
  })

  const packageJSON = fs.readFileSync(
    path.join(gitTargetDir, 'package.json'), 'utf8'
  )
  const pkg = JSON.parse(packageJSON)

  const oldDependencies = pkg.dependencies
  pkg.name = `@pre-bundled/${uriSafeModuleName}`
  pkg.bundledDependencies = Object.keys(oldDependencies)
  pkg.dependencies = {}

  if (Object.keys(oldDependencies).length === 0) {
    console.error(`This module ${moduleToBundle} has no deps`)
    console.error('Like literally dependencies is {}')
    return process.exit(1)
  }

  console.log(`Running npm install ${gitTargetDir}`)
  exec(`npm install --loglevel notice --prod`, {
    cwd: gitTargetDir
  })

  exec(`git add node_modules -f`, {
    cwd: gitTargetDir
  })
  exec(`git commit -m "Check in node_modules @ ${version}"`, {
    cwd: gitTargetDir
  })

  fs.writeFileSync(
    path.join(gitTargetDir, 'package.json'),
    JSON.stringify(pkg, null, 2),
    'utf8'
  )
  exec(`git add package.json`, {
    cwd: gitTargetDir
  })
  exec(`git commit -m "Rewrite package.json $ ${version}"`, {
    cwd: gitTargetDir
  })
  exec(`git push pre-bundled pre-bundled-${version} -f`, {
    cwd: gitTargetDir
  })

  console.log('Publishing module')
  const packOut = exec(`npm publish --force --access public`, {
    cwd: gitTargetDir
  })
  console.log(packOut.toString('utf8'))

  console.log(`npm info @pre-bundled/${uriSafeModuleName}`)
  const info = exec(
    `npm info @pre-bundled/${uriSafeModuleName}`
  )
  console.log(info.toString('utf8'))
}

if (require.main === module) {
  main().then(null, (err) => {
    process.nextTick(() => { throw err })
  })
}
