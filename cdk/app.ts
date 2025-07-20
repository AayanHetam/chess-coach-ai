import * as cdk from "aws-cdk-lib";
import { AppStack } from "./app-stack";

const app = new cdk.App();

new AppStack(app, "ChessMastiAI", {
  env: { region: "eu-west-3", account: process.env.CDK_DEFAULT_ACCOUNT },
  domainName: "chess-masti-ai.com",
  pagePaths: ["play", "database"],
});
