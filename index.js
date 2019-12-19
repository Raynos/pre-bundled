#!/usr/bin/env node
'use strict'

const exec = require('child_process').execSync
const os = require('os')
const path = require('path')
const fs = require('fs')

const minimist = require('minimist')
const mkdirp = require('mkdirp').sync
const rimraf = require('rimraf').sync
const replaceRequires = require('replace-requires')

class PreBundler {
  constructor () {
    this.args = minimist(process.argv.slice(2))

    this.moduleToBundle = this.args._[0]
    this.uriSafeModuleName = encodeURIComponent(
      this.moduleToBundle
    )
    this.moduleVersion = this.args._[1]
    this.dryMode = !!this.args.dry || !!this.args.dryMode

    this.gitTargetDir = null
  }

  ensureHub () {
    const hubOut = exec('which hub').toString('utf8')
    if (hubOut.length === 0) {
      console.error('Requires global installation of hub')
      return process.exit(1)
    }
  }

  cloneRepo (targetDir) {
    console.log()
    console.log(green('Running npm info'))
    console.log()

    const npmInfo = exec(
      `npm info ${this.moduleToBundle} repository.url`
    ).toString('utf8').trim()
    if (
      !npmInfo ||
      (
        npmInfo.indexOf('git') !== 0 &&
        npmInfo.indexOf('https://github.com') !== 0
      )
    ) {
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

    const gitTargetDir = path.join(
      targetDir, this.uriSafeModuleName
    )
    rimraf(gitTargetDir)

    console.log()
    console.log(green(`Cloning ${githubName} ${gitTargetDir}`))
    console.log()

    exec(`hub clone ${githubName} ${gitTargetDir}`)

    exec(`hub fork --org=pre-bundled`, {
      cwd: gitTargetDir
    })

    this.gitTargetDir = gitTargetDir
  }

  checkoutCorrectCode (version) {
    let checkoutVersion = version
    if (this.args.publishSuffix) {
      checkoutVersion += this.args.publishSuffix
    }

    console.log()
    console.log(green(`Switch to branch pre-bundled-${checkoutVersion}`))
    console.log()

    exec(`git checkout -b pre-bundled-${checkoutVersion}`, {
      cwd: this.gitTargetDir
    })

    exec(`git rm -r .`, {
      cwd: this.gitTargetDir
    })
    exec(`git clean -fd`, {
      cwd: this.gitTargetDir
    })
    exec(`git commit -m 'Remove all code for now'`, {
      cwd: this.gitTargetDir
    })

    exec(`npm pack ${this.moduleToBundle}@${version}`, {
      cwd: this.gitTargetDir
    })

    exec(`tar -zxvf ./${this.moduleToBundle}-${version}.tgz --strip 1`, {
      cwd: this.gitTargetDir
    })
    exec(`rm ./${this.moduleToBundle}-${version}.tgz`, {
      cwd: this.gitTargetDir
    })
    exec(`git add .`, {
      cwd: this.gitTargetDir
    })
    exec(`git commit -m 'Add the code from npm tarball manually'`, {
      cwd: this.gitTargetDir
    })
  }

  getFilesToRewrite (pkg) {
    const files = exec(`git ls-files`, {
      cwd: this.gitTargetDir
    }).toString('utf8').trim().split('\n')

    const jsFiles = []
    for (const file of files) {
      if (file.endsWith('.js')) {
        jsFiles.push(file)
      }
    }

    const binEntries = []
    if (typeof pkg.bin === 'string') {
      binEntries.push(pkg.bin)
    } else if (pkg.bin !== null && typeof pkg.bin === 'object') {
      for (const k of Object.keys(pkg.bin)) {
        binEntries.push(pkg.bin[k])
      }
    }

    for (let binEntry of binEntries) {
      if (binEntry.startsWith('./')) {
        binEntry = binEntry.slice(2, binEntry.length)
      }
      if (
        files.includes(binEntry) &&
        !jsFiles.includes(binEntry)
      ) {
        jsFiles.push(binEntry)
      }
    }
    return jsFiles
  }

  async main () {
    if (this.args.h || this.args.help || !this.args._[0]) {
      return printHelp()
    }

    if (!this.moduleToBundle) {
      console.error('Must specify module to bundle')
      console.error('pre-bundled {module}')
      return process.exit(1)
    }

    this.ensureHub()

    const targetDir = path.join(
      os.homedir(), '.config', 'pre-bundled'
    )
    mkdirp(targetDir)

    this.cloneRepo(targetDir)

    let version = this.moduleVersion
    if (!this.moduleVersion) {
      const npmVersion = exec(
        `npm info ${this.moduleToBundle} version --loglevel warn`
      ).toString('utf8').trim()
      version = npmVersion
    }

    this.checkoutCorrectCode(version)

    const packageJSON = fs.readFileSync(
      path.join(this.gitTargetDir, 'package.json'), 'utf8'
    )
    const pkg = JSON.parse(packageJSON)

    const publishSuffix = this.args.publishSuffix
    if (this.args.publishSuffix) {
      pkg.version += publishSuffix
      version += publishSuffix
    }

    const oldDependencies = pkg.dependencies
    const oldPeerDependencies = pkg.peerDependencies
    pkg.name = `@pre-bundled/${this.uriSafeModuleName}`
    pkg.dependencies = {}
    pkg.peerDependencies = {}

    if (Object.keys(oldDependencies).length === 0) {
      console.error(`This module ${this.moduleToBundle} has no deps`)
      console.error('Like literally dependencies is {}')
      return process.exit(1)
    }

    const jsFiles = this.getFilesToRewrite(pkg)

    console.log()
    console.log(green(`Running npm install ${this.gitTargetDir}`))
    console.log()

    if (oldPeerDependencies) {
      const packageJSON = fs.readFileSync(
        path.join(this.gitTargetDir, 'package.json'), 'utf8'
      )
      const tempPkg = JSON.parse(packageJSON)
      for (const k of Object.keys(tempPkg.peerDependencies)) {
        if (tempPkg.devDependencies && tempPkg.devDependencies[k]) {
          tempPkg.dependencies[k] = tempPkg.devDependencies[k]
        } else {
          tempPkg.dependencies[k] = tempPkg.peerDependencies[k]
        }
      }
      fs.writeFileSync(
        path.join(this.gitTargetDir, 'package.json'),
        JSON.stringify(tempPkg, null, 2),
        'utf8'
      )
    }

    exec(`npm install --loglevel notice --prod`, {
      cwd: this.gitTargetDir
    })

    /**
     * @TODO Raynos find all the frigging peer dependencies and
     * then install them
     */

    console.log()
    console.log(green(`Vendoring node_modules`))
    console.log()

    mkdirp(path.join(this.gitTargetDir, 'pre-bundled'))
    exec(`cp -r node_modules pre-bundled/node_modules`, {
      cwd: this.gitTargetDir
    })
    rimraf(path.join(this.gitTargetDir, 'node_modules'))

    exec(`git add pre-bundled`, {
      cwd: this.gitTargetDir
    })
    exec(`git commit -m 'Checking in node_modules'`, {
      cwd: this.gitTargetDir
    })

    console.log()
    console.log(green(`Rewriting require statements`))
    console.log()

    const dependencyNames = Object.keys(oldDependencies)
    if (oldPeerDependencies) {
      dependencyNames.push(...Object.keys(oldPeerDependencies))
    }

    const preBundleNodeMdls = path.join(
      this.gitTargetDir, 'pre-bundled', 'node_modules'
    )
    const depsOnDisk = fs.readdirSync(preBundleNodeMdls)
    for (const depOnDisk of depsOnDisk) {
      if (!dependencyNames.includes(depOnDisk)) {
        dependencyNames.push(depOnDisk)
      }
    }

    for (const file of jsFiles) {
      const fileName = path.join(this.gitTargetDir, file)
      const relative = path.relative(
        path.dirname(fileName), preBundleNodeMdls
      )
      const requireRewrites = {}
      for (const dep of dependencyNames) {
        let relativeName = path.join(relative, dep)
        if (!relativeName.startsWith('./') &&
            !relativeName.startsWith('..')
        ) {
          relativeName = './' + relativeName
        }
        requireRewrites[dep] = `require("${relativeName}")`
      }

      let text = fs.readFileSync(fileName, 'utf8')
      text = replaceRequires(text, requireRewrites)
      fs.writeFileSync(fileName, text, 'utf8')
    }

    console.log()
    console.log(green(`Commiting the code`))
    console.log()

    exec(`git add .`, {
      cwd: this.gitTargetDir
    })
    exec(`git commit -m "Check in pre-bundled @ ${version}"`, {
      cwd: this.gitTargetDir
    })

    fs.writeFileSync(
      path.join(this.gitTargetDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    )
    exec(`git add package.json`, {
      cwd: this.gitTargetDir
    })
    exec(`git commit -m "Rewrite package.json @ ${version}"`, {
      cwd: this.gitTargetDir
    })

    console.log()
    console.log(green(`Pushing the code`))
    console.log()

    exec(`git push pre-bundled pre-bundled-${version} -f`, {
      cwd: this.gitTargetDir
    })

    this.preparePublish()
  }

  preparePublish () {
    console.log()
    console.log(green(`Preparing the publish`))
    console.log()

    if (this.dryMode) {
      const packOut = exec(`npm pack`, {
        cwd: this.gitTargetDir
      })
      console.log(packOut.toString('utf8'))
    } else {
      console.log()
      console.log(green(`Publishing the module`))
      console.log()

      const publishOut = exec(`npm publish --force --access public`, {
        cwd: this.gitTargetDir
      })
      console.log(publishOut.toString('utf8'))

      console.log()
      console.log(
        green(`npm info @pre-bundled/${this.uriSafeModuleName}`)
      )
      console.log()

      const info = exec(
        `npm info @pre-bundled/${this.uriSafeModuleName}`
      )
      console.log(info.toString('utf8'))
    }
  }
}

if (require.main === module) {
  const bundler = new PreBundler()
  bundler.main().then(null, (err) => {
    process.nextTick(() => { throw err })
  })
}

function printHelp () {
  console.log('pre-bundled {module} {version}')
  console.log('This tool re-bundles a module and publishes')
  console.log('  It to both github & npm for pre-bundled')
  console.log('  ')
  console.log('  module: NPM module name')
  console.log('  version: Version you want to bundle')
  console.log()
  console.log('To run this tool you need access to NPM & github')
  console.log('Ask @Raynos on twitter')
  console.log()
  console.log()
  console.log('  --dry Run it in dry mode ( no publish )')
  console.log('  --publishSuffix set a suffic for publishing')
  return process.exit(0)
}

function green (text) {
  return '\u001b[32m' + text + '\u001b[39m'
}
