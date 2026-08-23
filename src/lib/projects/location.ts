import type { DesignProjectDto, ProjectSummaryDto } from "@/platform/projects/types";

type ProjectLocation = Pick<
  DesignProjectDto | ProjectSummaryDto,
  "id" | "productId" | "productVersionId" | "optionSelection"
>;

type ConfigurationLocation = Pick<
  DesignProjectDto | ProjectSummaryDto,
  "productId" | "productVersionId" | "optionSelection"
>;

function applyResolvedConfiguration(url: URL, configuration: ConfigurationLocation) {
  url.searchParams.set("product", configuration.productId);
  url.searchParams.set("version", configuration.productVersionId);
  const optionEntries = Object.entries(configuration.optionSelection);
  if (optionEntries.length) {
    url.searchParams.set(
      "options",
      JSON.stringify(Object.fromEntries(optionEntries.sort(([a], [b]) => a.localeCompare(b)))),
    );
  } else {
    url.searchParams.delete("options");
  }
  return url;
}

export function applyProjectLocation(url: URL, project: ProjectLocation) {
  applyResolvedConfiguration(url, project);
  url.searchParams.set("project", project.id);
  return url;
}

export function configurationStudioHref(configuration: ConfigurationLocation) {
  return applyResolvedConfiguration(new URL("http://vortex.invalid/studio"), configuration)
    .toString()
    .replace("http://vortex.invalid", "");
}

export function projectStudioHref(project: ProjectLocation) {
  return applyProjectLocation(new URL("http://vortex.invalid/studio"), project)
    .toString()
    .replace("http://vortex.invalid", "");
}
