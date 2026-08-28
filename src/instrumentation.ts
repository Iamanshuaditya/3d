/**
 * Startup gate (#26).
 *
 * `register` runs once and must finish before the server accepts a request, so
 * a misconfigured deployment fails here — loudly, naming the variable — rather
 * than serving a home page and then returning an opaque 500 the first time a
 * customer tries to save.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateDeploymentConfig, DeploymentConfigError } = await import(
    "@/server/config/environment"
  );

  try {
    const config = validateDeploymentConfig();
    console.info(
      JSON.stringify({
        scope: "vortex-platform",
        event: "deployment.configured",
        mode: config.mode,
        database: config.database,
        objectStore: config.objectStore,
        production: config.production,
      }),
    );
  } catch (error) {
    if (error instanceof DeploymentConfigError) {
      console.error(
        JSON.stringify({
          scope: "vortex-platform",
          event: "deployment.misconfigured",
          problems: error.problems,
        }),
      );
      console.error(`\n${error.message}\n`);
      // Refusing to start is the point: a half-configured production server is
      // worse than one that never accepted a request.
      throw error;
    }
    throw error;
  }
}
