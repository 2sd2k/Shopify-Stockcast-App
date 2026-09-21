import { defineRailway, project, service } from "railway/iac";

export const partial = "stockcast";

export default defineRailway(() => {
  const app = service("stockcast", {
    // Built from the Dockerfile: `react-router build`, then dev deps pruned.
    start: "npm run docker-start",
    healthcheck: "/privacy",
    healthcheckTimeout: 120,
    replicas: 1,
    restartPolicy: { type: "ON_FAILURE", maxRetries: 5 },
  });
  return project("stockcast", { resources: [app] });
});
