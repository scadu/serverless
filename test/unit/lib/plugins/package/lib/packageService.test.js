'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const chai = require('chai');
const sinon = require('sinon');
const Package = require('../../../../../../lib/plugins/package/package');
const Serverless = require('../../../../../../lib/Serverless');
const serverlessConfigFileUtils = require('../../../../../../lib/utils/getServerlessConfigFile');
const { createTmpDir, listZipFiles, listFilePermissions } = require('../../../../../utils/fs');
const runServerless = require('../../../../../utils/run-serverless');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('#packageService()', () => {
  let serverless;
  let packagePlugin;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.processedInput = { options: {} };
    packagePlugin = new Package(serverless, {});
    packagePlugin.serverless.cli = new serverless.classes.CLI();
    packagePlugin.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };
    packagePlugin.serverless.service.provider = { runtime: 'nodejs:8.10' };
  });

  describe('#getIncludes()', () => {
    it('should merge package includes', () => {
      const packageIncludes = ['dir', 'file.js'];

      serverless.service.package.include = packageIncludes;

      const include = packagePlugin.getIncludes();
      expect(include).to.deep.equal(['dir', 'file.js']);
    });

    it('should merge package and func includes', () => {
      const funcIncludes = ['lib', 'other.js'];
      const packageIncludes = ['dir', 'file.js'];

      serverless.service.package.include = packageIncludes;

      const include = packagePlugin.getIncludes(funcIncludes);
      expect(include).to.deep.equal(['dir', 'file.js', 'lib', 'other.js']);
    });
  });

  describe('#getExcludes()', () => {
    const serverlessConfigFileName = 'serverless.xyz';

    before(() => {
      sinon
        .stub(serverlessConfigFileUtils, 'getServerlessConfigFilePath')
        .returns(BbPromise.resolve(`/path/to/${serverlessConfigFileName}`));
    });

    after(() => {
      serverlessConfigFileUtils.getServerlessConfigFilePath.restore();
    });

    it('should exclude plugins localPath defaults', () => {
      const localPath = './myplugins';
      serverless.service.plugins = { localPath };

      return expect(packagePlugin.getExcludes()).to.be.fulfilled.then((exclude) =>
        expect(exclude).to.deep.equal(
          _.union(packagePlugin.defaultExcludes, [serverlessConfigFileName], [localPath])
        )
      );
    });

    it('should merge defaults with plugin localPath and excludes', () => {
      const localPath = './myplugins';
      serverless.service.plugins = { localPath };

      const packageExcludes = ['dir', 'file.js'];
      serverless.service.package.exclude = packageExcludes;

      return expect(packagePlugin.getExcludes()).to.be.fulfilled.then((exclude) =>
        expect(exclude).to.deep.equal(
          _.union(
            packagePlugin.defaultExcludes,
            [serverlessConfigFileName],
            [localPath],
            packageExcludes
          )
        )
      );
    });

    it('should merge defaults with plugin localPath package and func excludes', () => {
      const localPath = './myplugins';
      serverless.service.plugins = { localPath };

      const packageExcludes = ['dir', 'file.js'];
      serverless.service.package.exclude = packageExcludes;

      const funcExcludes = ['lib', 'other.js'];

      return expect(packagePlugin.getExcludes(funcExcludes)).to.be.fulfilled.then((exclude) =>
        expect(exclude).to.deep.equal(
          _.union(
            packagePlugin.defaultExcludes,
            [serverlessConfigFileName],
            [localPath],
            packageExcludes,
            funcExcludes
          )
        )
      );
    });
  });

  describe('#packageService()', () => {
    it('should package functions individually', () => {
      serverless.service.package.individually = true;
      serverless.service.functions = {
        'test-one': {
          name: 'test-one',
        },
        'test-two': {
          name: 'test-two',
        },
      };

      const packageFunctionStub = sinon
        .stub(packagePlugin, 'packageFunction')
        .resolves((func) => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(
        () => expect(packageFunctionStub).to.be.calledTwice
      );
    });

    it('should package single function individually', () => {
      serverless.service.functions = {
        'test-one': {
          name: 'test-one',
          package: {
            individually: true,
          },
        },
        'test-two': {
          name: 'test-two',
        },
      };

      const packageFunctionStub = sinon
        .stub(packagePlugin, 'packageFunction')
        .resolves((func) => func.name);
      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves((func) => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
        BbPromise.join(
          expect(packageFunctionStub).to.be.calledOnce,
          expect(packageAllStub).to.be.calledOnce
        )
      );
    });

    it('should not package functions if package artifact specified', () => {
      serverless.service.package.artifact = 'some/file.zip';

      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves();

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(
        () => expect(packageAllStub).to.not.be.called
      );
    });

    it('should package functions individually if package artifact specified', () => {
      serverless.service.package.artifact = 'some/file.zip';
      serverless.service.package.individually = true;
      serverless.service.functions = {
        'test-one': {
          name: 'test-one',
        },
        'test-two': {
          name: 'test-two',
        },
      };

      const packageFunctionStub = sinon
        .stub(packagePlugin, 'packageFunction')
        .resolves((func) => func.name);
      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves((func) => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
        BbPromise.join(
          expect(packageFunctionStub).to.be.calledTwice,
          expect(packageAllStub).to.not.be.called
        )
      );
    });

    it('should package single functions individually if package artifact specified', () => {
      serverless.service.package.artifact = 'some/file.zip';
      serverless.service.functions = {
        'test-one': {
          name: 'test-one',
          package: {
            individually: true,
          },
        },
        'test-two': {
          name: 'test-two',
        },
      };

      const packageFunctionStub = sinon
        .stub(packagePlugin, 'packageFunction')
        .resolves((func) => func.name);
      const packageAllStub = sinon.stub(packagePlugin, 'packageAll').resolves((func) => func.name);

      return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
        BbPromise.join(
          expect(packageFunctionStub).to.be.calledOnce,
          expect(packageAllStub).to.not.be.called
        )
      );
    });
  });

  describe('#packageAll()', () => {
    const exclude = ['test-exclude'];
    const include = ['test-include'];
    const files = [];
    const artifactFilePath = '/some/fake/path/test-artifact.zip';
    let getExcludesStub;
    let getIncludesStub;
    let resolveFilePathsFromPatternsStub;
    let zipFilesStub;

    beforeEach(() => {
      getExcludesStub = sinon
        .stub(packagePlugin, 'getExcludes')
        .returns(BbPromise.resolve(exclude));
      getIncludesStub = sinon.stub(packagePlugin, 'getIncludes').returns(include);
      resolveFilePathsFromPatternsStub = sinon
        .stub(packagePlugin, 'resolveFilePathsFromPatterns')
        .returns(files);
      zipFilesStub = sinon.stub(packagePlugin, 'zipFiles').resolves(artifactFilePath);
    });

    afterEach(() => {
      packagePlugin.getExcludes.restore();
      packagePlugin.getIncludes.restore();
      packagePlugin.resolveFilePathsFromPatterns.restore();
      packagePlugin.zipFiles.restore();
    });

    (process.platform === 'win32' ? it : it.skip)(
      'should call zipService with settings & binaries to chmod on win32',
      () => {
        const servicePath = 'test';
        const zipFileName = `${serverless.service.service}.zip`;

        serverless.config.servicePath = servicePath;

        return expect(packagePlugin.packageService()).to.be.fulfilled.then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,
            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(files, zipFileName, []),
          ])
        );
      }
    );
  });

  describe('#packageLayer()', () => {
    const exclude = ['test-exclude'];
    const include = ['test-include'];
    const files = [];
    const artifactFilePath = '/some/fake/path/test-artifact.zip';
    let getExcludesStub;
    let getIncludesStub;
    let resolveFilePathsFromPatternsStub;
    let zipFilesStub;

    beforeEach(() => {
      getExcludesStub = sinon
        .stub(packagePlugin, 'getExcludes')
        .returns(BbPromise.resolve(exclude));
      getIncludesStub = sinon.stub(packagePlugin, 'getIncludes').returns(include);
      resolveFilePathsFromPatternsStub = sinon
        .stub(packagePlugin, 'resolveFilePathsFromPatterns')
        .returns(files);
      zipFilesStub = sinon.stub(packagePlugin, 'zipFiles').resolves(artifactFilePath);
    });

    afterEach(() => {
      packagePlugin.getExcludes.restore();
      packagePlugin.getIncludes.restore();
      packagePlugin.resolveFilePathsFromPatterns.restore();
      packagePlugin.zipFiles.restore();
    });

    it('should call zipService with settings', () => {
      const servicePath = 'test';
      const layerName = 'test-layer';

      const zipFileName = 'test-layer.zip';

      serverless.config.servicePath = servicePath;
      serverless.service.layers = {};
      serverless.service.layers[layerName] = { path: './foobar' };

      return expect(packagePlugin.packageLayer(layerName))
        .to.eventually.equal(artifactFilePath)
        .then(() =>
          BbPromise.all([
            expect(getExcludesStub).to.be.calledOnce,
            expect(getIncludesStub).to.be.calledOnce,
            expect(resolveFilePathsFromPatternsStub).to.be.calledOnce,

            expect(zipFilesStub).to.be.calledOnce,
            expect(zipFilesStub).to.have.been.calledWithExactly(
              files,
              zipFileName,
              path.resolve('./foobar')
            ),
          ])
        );
    });
  });

  describe('#resolveFilePathsFromPatterns()', () => {
    // NOTE: the path.join in `beforeEach` will take care of OS
    // independent file paths
    const handlerFile = 'src/function/handler.js';
    const utilsFile = 'src/utils/utils.js';
    const dotsFile = 'src/dots/[...file].js';
    let servicePath;

    beforeEach(() => {
      servicePath = createTmpDir();
      fse.ensureFileSync(path.join(servicePath, handlerFile));
      fse.ensureFileSync(path.join(servicePath, utilsFile));
      fse.ensureFileSync(path.join(servicePath, dotsFile));
    });

    it('should exclude all and include function/handler.js', () => {
      const params = {
        exclude: ['**'],
        include: [handlerFile],
      };
      serverless.config.servicePath = servicePath;

      return expect(
        packagePlugin.resolveFilePathsFromPatterns(params)
      ).to.be.fulfilled.then((actual) => expect(actual).to.deep.equal([handlerFile]));
    });

    it('should include file specified with `!` in exclude params', () => {
      const params = {
        exclude: ['**', `!${utilsFile}`],
        include: [handlerFile],
      };
      serverless.config.servicePath = servicePath;

      return expect(
        packagePlugin.resolveFilePathsFromPatterns(params)
      ).to.be.fulfilled.then((actual) =>
        expect(actual.sort()).to.deep.equal([handlerFile, utilsFile].sort())
      );
    });

    it('should exclude file specified with `!` in include params', () => {
      const params = {
        exclude: [],
        include: [`!${utilsFile}`],
      };
      const expected = [dotsFile, handlerFile];
      serverless.config.servicePath = servicePath;

      return expect(
        packagePlugin.resolveFilePathsFromPatterns(params)
      ).to.be.fulfilled.then((actual) => expect(actual.sort()).to.deep.equal(expected.sort()));
    });
  });
});

describe('lib/plugins/package/lib/packageService.test.js', () => {
  const mockedDescribeStacksResponse = {
    CloudFormation: {
      describeStacks: {
        Stacks: [
          {
            Outputs: [
              { OutputKey: 'LayerLambdaLayerHash', OutputValue: '123' },
              { OutputKey: 'LayerLambdaLayerS3Key', OutputValue: 'path/to/layer.zip' },
            ],
          },
        ],
      },
    },
  };

  describe('service wide', () => {
    let fnIndividualZippedFiles;
    let fnLayerFiles;
    let fnFilePermissions;

    before(async () => {
      const {
        fixtureData: { servicePath },
      } = await runServerless({
        fixture: 'packaging',
        cliArgs: ['package'],
        awsRequestStubMap: mockedDescribeStacksResponse,
        configExt: {
          package: {
            exclude: ['dir1/**', '!dir1/subdir3/**'],
            include: ['dir1/subdir2/**', '!dir1/subdir2/subsubdir1'],
          },
          functions: {
            fnIndividual: {
              handler: 'index.handler',
              package: {
                individually: true,
                include: 'dir1/subdir4/**',
                exclude: 'dir3/**',
              },
            },
          },
        },
      });

      fnIndividualZippedFiles = await listZipFiles(
        path.join(servicePath, '.serverless', 'fnIndividual.zip')
      );
      fnLayerFiles = await listZipFiles(path.join(servicePath, '.serverless', 'layer.zip'));
      fnFilePermissions = await listFilePermissions(
        path.join(servicePath, '.serverless', 'fnIndividual.zip')
      );
    });

    it('should exclude defaults', () => {
      expect(fnIndividualZippedFiles).to.not.include('.gitignore');
    });

    it('should exclude service config', () => {
      expect(fnIndividualZippedFiles).to.not.include('serverless.yml');
    });

    describe('with useDotenv', () => {
      it('should exclude .env files', async () => {
        before(async () => {
          const {
            fixtureData: { servicePath },
          } = await runServerless({
            fixture: 'packaging',
            cliArgs: ['package'],
            awsRequestStubMap: mockedDescribeStacksResponse,
            configExt: {
              useDotenv: true,
              functions: {
                fnIndividual: {
                  handler: 'index.handler',
                  package: { individually: true },
                },
              },
            },
          });

          const zippedFiles = await listZipFiles(
            path.join(servicePath, '.serverless', 'fnIndividual.zip')
          );

          expect(zippedFiles).to.not.include('.env');
          expect(zippedFiles).to.not.include('.env.stage');
        });
      });
    });

    it('should exclude default plugins localPath', () => {
      // Confirm ".serverless-plugins/index.js" is not packaged
      expect(fnIndividualZippedFiles).to.not.include('.serverless-plugins/index.js');
      // Replaces
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L87-L96
    });

    it('should support `package.exclude`', () => {
      // Confirm "dir1/subdir1/index.js" is not packaged
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir1/index.js');
      // Confirm "dir1/subdir3/index.js" is packaged
      expect(fnIndividualZippedFiles).to.include('dir1/subdir3/index.js');
      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L128-L145
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L637-L649
    });

    it('should support `package.include`', () => {
      // Confirm "dir1/subdir2/index.js" is packaged
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/index.js');
      // Confirm "dir1/subdir2/subsubdir1/index.js" is not packaged
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir2/subsubdir1/index.js');
      // Confirm "dir1/subdir2/subsubdir2/index.js" is packaged
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/subsubdir2/index.js');
      // Replaces
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L43-L50
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L625-L635
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L651-L662
    });

    it('TODO: should support `functions[].package.individually`', () => {
      // Confirm there's functions.fnIndividual.package.artifact
      // Not sure if valid. To be checked.
      expect(fnIndividualZippedFiles).to.include('artifact.zip');
      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L201-L225
    });

    it('should support `functions[].package.include`', () => {
      // Confirm that in function dedicated artifact "dir1/subdir/index.js" is packaged
      expect(fnIndividualZippedFiles).to.include('dir1/subdir4/index.js');
      // Replaces
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L147-L168
    });
    it.skip('TODO: should support `functions[].package.include`', () => {
      // Confirm that in function dedicated artifact "dir1/subdir4/index.js" is packaged
    });

    (process.platform === 'win32' ? it : it.skip)(
      'should mark go runtime handler files as executable on windows',
      () => {
        // Confirm that packaged go handler is executable
        expect(fnFilePermissions['main.go'].unixPermissions).to.equal(Math.pow(2, 15) + 0o755);
        // Replace
        // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L335-L376
      }
    );

    it('should package layer', () => {
      expect(fnLayerFiles).to.include('layer-module-1.js');
      expect(fnLayerFiles).to.include('layer-module-2.js');

      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L581-L607
    });
  });

  describe('individually', () => {
    let fnIndividualZippedFiles;

    before(async () => {
      const {
        fixtureData: { servicePath },
      } = await runServerless({
        fixture: 'packaging',
        cliArgs: ['package'],
        awsRequestStubMap: mockedDescribeStacksResponse,
        configExt: {
          package: {
            individually: true,
            artifact: 'artifact.zip',
            exclude: ['dir1/**', '!dir1/subdir3/**'],
            include: ['dir1/subdir2/**', '!dir1/subdir2/subsubdir1'],
          },
          functions: {
            fnIndividual: {
              handler: 'index.handler',
              package: { individually: true, include: 'dir1/subdir3/**', exclude: 'dir1/subdir1' },
            },
          },
          plugins: {
            localPath: './custom-plugins',
            modules: ['index'],
          },
        },
      });

      fnIndividualZippedFiles = await listZipFiles(
        path.join(servicePath, '.serverless', 'fnIndividual.zip')
      );
    });

    it('should exclude custom plugins localPath', () => {
      expect(fnIndividualZippedFiles).to.not.include('.custom-plugins/index.js');
    });

    it('should ignore `package.artifact` if `package.individually`', () => {
      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L237-L260
    });

    it('should support `package.individually`', () => {
      // Confirm on different artifacts on functions
      //
      // Replaces
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L181-L199
    });

    it('should support `package.exclude`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir3/index.js');
    });

    it('should support `package.include`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/index.js');
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir2/subsubdir1/index.js');

      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L52-L60
    });
  });

  describe.skip('pre-prepared artifact', () => {
    before(async () => {
      await runServerless({
        fixture: 'packaging',
        cliArgs: ['package'],
        awsRequestStubMap: mockedDescribeStacksResponse,
        configExt: {
          package: {
            artifact: 'artifact.zip',
            exclude: ['dir1', '!dir1/subdir3/**'],
            include: ['dir1/subdir2/**', '!dir1/subdir2/subsubdir1'],
          },
          functions: {
            fnIndividual: {
              handler: 'index.handler',
              package: { individually: true, include: 'dir1/subdir3/**', exclude: 'dir1/subdir2' },
            },
            fnArtifact: {
              handler: 'index.handler',
              package: { artifact: 'artifact-function.zip' },
            },
          },
        },
      });
    });
    it('should support `package.artifact`', () => {
      // Confirm that file pointed at `package.artifact` is configured as service level artifact
      //
      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L227-L235
    });

    it('should ignore `package.artifact` if `functions[].package.individually', () => {
      // Confirm that fnIndividual was packaged independently
      //
      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L262-L287
    });

    it('should support `functions[].package.artifact`', () => {
      // Confirm that file pointed at `functions.fnArtifact.package.artifact` is configured as function level artifact
    });
  });
});
