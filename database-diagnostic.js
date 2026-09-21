const path = require("path");
const packageJson = require("./package.json");
const {
  applicationMetadata,
  calculateDevelopmentUserData,
  expectedDatabasePath,
  formatDiagnostic,
  inspectDatabasePath,
} = require("./database-diagnostic-core");

async function run() {
  const metadata = applicationMetadata(packageJson, { packaged: false });
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
  const developmentUserData = calculateDevelopmentUserData(appData, packageJson);
  const runtimeUserData = developmentUserData;
  const explicitPath = process.argv.slice(2).find((value) => !value.startsWith("--"));
  const database = await inspectDatabasePath(explicitPath ? path.resolve(explicitPath) : expectedDatabasePath(runtimeUserData));
  console.log(formatDiagnostic({ metadata, developmentUserData, runtimeUserData, database }));
}

run().catch((error) => {
  console.error(`Database diagnostic failed: ${error.message}`);
  process.exitCode = 1;
});
