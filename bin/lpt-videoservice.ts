#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LptVideoserviceStack } from '../lib/lpt-videoservice-stack';

const app = new cdk.App();
new LptVideoserviceStack(app, 'LptVideoserviceStack');
