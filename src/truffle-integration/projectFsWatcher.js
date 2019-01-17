const EventEmitter = require("events");
const path = require("path");
const fs = require("fs");
const getProjectDetails = require("./projectDetails").get;
const merge = require("lodash.merge");

class ProjectFsWatcher extends EventEmitter {
  constructor(project, networkId) {
    super();

    this.project = project;
    this.networkId = networkId;

    this.configWatcher = null;
    this.parentDirectoryWatcher = null;
    this.buildDirectoryWatcher = null;
    this.contractBuildDirectoryWatcher = null;

    this.contracts = [];
    this.fileToContractIdx = {};

    this.start();
  }

  getProject() {
    const tempProject = merge({}, this.project, {
      contracts: this.contracts.filter(contract => contract !== null),
    });
    return tempProject;
  }

  setContracts(contracts) {
    this.contracts = contracts;
  }

  start() {
    this.configWatcher = fs.watch(
      this.project.configFile,
      { encoding: "utf8" },
      () => {
        // the config file was either removed or changed, we may want to reload it

        this.stopWatchingParentDirectory();
        this.stopWatchingBuildDirectory();
        this.stopWatchingContracts();

        this.project = getProjectDetails(this.project.configFile);
        // do we want to emit the project potencially got changed?

        this.startWatchingParentDirectory();
      },
    );

    this.startWatchingParentDirectory();
  }

  startWatchingParentDirectory() {
    this.stopWatchingParentDirectory();

    this.parentDirectoryWatcher = fs.watch(
      path.dirname(this.project.config.build_directory),
      { encoding: "utf8" },
      (eventType, filename) => {
        if (filename === path.basename(this.project.config.build_directory)) {
          this.startWatchingBuildDirectory();
        }
      },
    );

    this.startWatchingBuildDirectory();
  }

  stopWatchingParentDirectory() {
    if (this.parentDirectoryWatcher) this.parentDirectoryWatcher.close();
    this.parentDirectoryWatcher = null;
  }

  startWatchingBuildDirectory() {
    this.stopWatchingBuildDirectory();

    if (fs.existsSync(this.project.config.build_directory)) {
      this.buildDirectoryWatcher = fs.watch(
        this.project.config.build_directory,
        { encoding: "utf8" },
        (eventType, filename) => {
          if (
            filename ===
            path.basename(this.project.config.contracts_build_directory)
          ) {
            this.startWatchingContracts();
          }
        },
      );

      this.startWatchingContracts();
    }
  }

  stopWatchingBuildDirectory() {
    if (this.buildDirectoryWatcher) this.buildDirectoryWatcher.close();
    this.buildDirectoryWatcher = null;
  }

  contractExists(file) {
    return fs.existsSync(
      path.join(this.project.config.contracts_build_directory, file),
    );
  }

  readContract(file) {
    try {
      const contract = JSON.parse(
        fs.readFileSync(
          path.join(this.project.config.contracts_build_directory, file),
          "utf8",
        ),
      );

      if (contract.networks[this.networkId]) {
        contract.address = contract.networks[this.networkId].address;
        contract.creationTxHash =
          contract.networks[this.networkId].transactionHash;
      }

      return contract;
    } catch (e) {
      return null;
    }
  }

  readContracts() {
    const files = fs.readdirSync(this.project.config.contracts_build_directory);
    for (let i = 0; i < files.length; i++) {
      const extension = path.extname(files[i]);
      if (extension === ".json") {
        this.fileToContractIdx[files[i]] = this.contracts.length;
        const contract = this.readContract(files[i]);
        this.contracts.push(contract);
      }
    }
  }

  handleContractFileEvent(eventType, filename) {
    const extension = path.extname(filename);
    if (extension === ".json") {
      if (eventType === "rename") {
        if (this.contractExists(filename)) {
          // created
          this.fileToContractIdx[filename] = this.contracts.length;
          const contract = this.readContract(filename);
          this.contracts.push(contract);
        } else {
          // deleted
          this.contracts.splice(this.fileToContractIdx[filename]);
          delete this.fileToContractIdx[filename];
        }
      } else if (eventType === "change") {
        // modified
        const contract = this.readContract(filename);
        this.contracts[this.fileToContractIdx[filename]] = contract;
      }
    }
  }

  startWatchingContracts() {
    this.stopWatchingContracts();

    if (fs.existsSync(this.project.config.contracts_build_directory)) {
      this.readContracts();

      this.contractBuildDirectoryWatcher = fs.watch(
        this.project.config.contracts_build_directory,
        { encoding: "utf8" },
        (eventType, filename) => {
          this.handleContractFileEvent(eventType, filename);
          this.emit("project-details-update", this.getProject());
        },
      );
    }

    this.emit("project-details-update", this.getProject());
  }

  stopWatchingContracts() {
    if (this.contractBuildDirectoryWatcher)
      this.contractBuildDirectoryWatcher.close();
    this.contractBuildDirectoryWatcher = null;

    this.contracts = [];
    this.fileToContractIdx = {};
  }

  stop() {
    if (this.configWatcher) this.configWatcher.close();
    this.stopWatchingParentDirectory();
    this.stopWatchingBuildDirectory();
    this.stopWatchingContracts();
  }
}

module.exports = ProjectFsWatcher;
