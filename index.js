#!/usr/bin/env node
'use strict'

const exec = require('child_process').execSync
const os = require('os')
const path = require('path')
const fs = require('fs')

const minimist = require('minimist')
const mkdirp = require('mkdirp').sync
const rimraf = require('rimraf').sync

const NODERIFY = path.join(
  __dirname, 'node_modules', '.bin', 'noderify'
)

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
    const whichOut = exec('which hub').toString('utf8')
    if (whichOut.length === 0) {
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
    const tagList = exec(`git tag -l`, {
      cwd: this.gitTargetDir
    }).toString('utf8')

    let checkoutTarget = `v${version}`
    const tagVersions = tagList.split('\n')

    if (tagVersions.includes(version)) {
      /** Author of module uses weird git tags. */
      checkoutTarget = version
    } else if (!tagVersions.includes(`v${version}`)) {
      /**
       * The author of ${module} does not tag their git tags ...
       */
      const gitLog = exec(
        `git log --no-decorate --patch package.json`, {
          cwd: this.gitTargetDir
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

    console.log()
    console.log(green(`Checking out ${checkoutTarget}`))
    console.log()

    exec(`git checkout ${checkoutTarget}`, {
      cwd: this.gitTargetDir
    })

    if (this.args.publishSuffix) {
      version += this.args.publishSuffix
    }

    console.log()
    console.log(green(`Switch to branch pre-bundled-${version}`))
    console.log()

    exec(`git checkout -b pre-bundled-${version}`, {
      cwd: this.gitTargetDir
    })
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

    let version = this.moduleVersion
    if (!this.moduleVersion) {
      const packageJSON = fs.readFileSync(
        path.join(this.gitTargetDir, 'package.json'), 'utf8'
      )
      const tempPkg = JSON.parse(packageJSON)
      version = tempPkg.version
    }

    /**
     * Bail on checking it out from the source code. its a massive
     * pain on the dick.
     *
     * Just git rm all the fucking files
     * THen download the tarball from npm
     * then unpack it in place.
     * THen check that shit into git.
     */
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
    pkg.name = `@pre-bundled/${this.uriSafeModuleName}`
    pkg.dependencies = {}

    if (Object.keys(oldDependencies).length === 0) {
      console.error(`This module ${this.moduleToBundle} has no deps`)
      console.error('Like literally dependencies is {}')
      return process.exit(1)
    }

    console.log()
    console.log(green(`Running npm install ${this.gitTargetDir}`))
    console.log()

    exec(`npm install --loglevel notice --prod`, {
      cwd: this.gitTargetDir
    })

    console.log()
    console.log(green(`Bundling the source code`))
    console.log()

    /**
     * Create a __pre-bundled_node_modules__.js file
     * Use noderify on it.
     */

    // const filesToCommit = []
    // let main = pkg.main || 'index.js'
    // pkg.main = renameFileWithPreBundled(main)
    // this.preBundle(gitTargetDir, pkg, main, pkg.main)
    // filesToCommit.push(path.join(gitTargetDir, pkg.main))

    // if (typeof pkg.bin === 'string') {
    //   const bin = pkg.bin
    //   pkg.bin = renameFileWithPreBundled(bin)
    //   this.preBundle(gitTargetDir, pkg, bin, pkg.bin)
    //   filesToCommit.push(path.join(gitTargetDir, pkg.bin))
    // } else if (pkg.bin !== null && typeof pkg.bin === 'object') {
    //   for (const key of Object.keys(pkg.bin)) {
    //     const bin = pkg.bin[key]
    //     pkg.bin[key] = renameFileWithPreBundled(bin)
    //     this.preBundle(gitTargetDir, pkg, bin, pkg.bin[key])
    //     filesToCommit.push(path.join(gitTargetDir, pkg.bin[key]))
    //   }
    // }

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

  preBundle (gitTargetDir, pkg, source, target) {
    const sourceFile = path.join(gitTargetDir, source)
    const outFile = path.join(gitTargetDir, target)
    const exists = fs.existsSync(sourceFile)
    if (!exists) {
      console.log()
      console.log(green(`Could not find source code; doing fallback`))
      console.log()

      const scripts = pkg.scripts
      if (scripts.compile) {
        console.log()
        console.log(green(`exec: npm i && npm run compile`))
        console.log()

        exec('npm install --loglevel notice', {
          cwd: gitTargetDir
        })
        exec('npm run compile', {
          cwd: gitTargetDir
        })
      } else if (scripts.build) {
        console.log()
        console.log(green(`exec: npm i && npm run build`))
        console.log()

        exec('npm install --loglevel notice', {
          cwd: gitTargetDir
        })
        exec('npm run build', {
          cwd: gitTargetDir
        })
      } else {
        console.log()
        console.log(green(`exec: npm i && npm test`))
        console.log()

        exec('npm install --loglevel notice', {
          cwd: gitTargetDir
        })
        exec('npm test', {
          cwd: gitTargetDir
        })
      }
    }

    mkdirp(path.dirname(outFile))
    exec(`node ${NODERIFY} ${sourceFile} -o ${outFile}`, {
      cwd: gitTargetDir
    })
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

function renameFileWithPreBundled (fileName) {
  if (fileName.endsWith('.js')) {
    fileName = fileName.slice(0, fileName.length - 3)
    fileName += '__pre-bundled__.js'
    return fileName
  }

  return fileName + '__pre-bundled__'
}
