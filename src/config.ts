import path from 'path';
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import nodemailer from 'nodemailer';

export const Olympiads = new Set([
  'apio', 'bkoi', 'boi', 'ceoi',
  'coi', 'egoi', 'ejoi', 'gks',
  'inoi', 'ioi', 'ioitc', 'izho',
  'joifr', 'joioc', 'joisc', 'noifinal',
  'noiprelim', 'noiqual', 'noisel', 'poi', 'rmi',
  'roi', 'usacobronze', 'usacogold', 'usacoplatinum',
  'usacosilver', 'zco', 'cnoi', 'coci'
]);

export const Platforms = new Set([
  'atcoder', 'baekjoon', 'cms', 'codebreaker',
  'codechef', 'codedrills', 'codeforces', 'dmoj',
  'oj.uz', 'qoj.ac', 'szkopuł', 'usaco',
  'eolymp', 'kattis'
]);

export const HostnameToPlatform: Record<string, string> = {
  'acmicpc.net': 'baekjoon',
  'atcoder.jp': 'atcoder',
  'cms.iarcs.org.in': 'cms',
  'codebreaker.xyz': 'codebreaker',
  'codechef.com': 'codechef',
  'codedrills.io': 'codedrills',
  'codeforces.com': 'codeforces',
  'dmoj.ca': 'dmoj',
  'icpc.codedrills.io': 'codedrills',
  'oj.uz': 'oj.uz',
  'qoj.ac': 'qoj.ac',
  'szkopul.edu.pl': 'szkopuł',
  'usaco.org': 'usaco',
  'eolymp.com': 'eolymp',
  'open.kattis.com': 'kattis'
}

export const root = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(root, '.env') });

function validateEnv(key: string, fatal: boolean = true) {
  if (!process.env[key] && fatal) {
    throw new Error(`Environment variable ${key} is not set. You may want to check your .env`);
  }
  return process.env[key] ?? '';
}

export const GithubClientId = validateEnv('GITHUB_CLIENT_ID');
export const GithubClientSecret = validateEnv('GITHUB_CLIENT_SECRET');
export const GoogleClientId = validateEnv('GOOGLE_CLIENT_ID');
export const GoogleClientSecret = validateEnv('GOOGLE_CLIENT_SECRET');
export const DiscordClientId = validateEnv('DISCORD_CLIENT_ID');
export const DiscordClientSecret = validateEnv('DISCORD_CLIENT_SECRET');
function validateEnvList(key: string): string[] {
  return validateEnv(key).split(',').map(v => v.trim()).filter(Boolean);
}

export const QojUsers = validateEnvList('QOJ_USERS');
export const QojPasses = validateEnvList('QOJ_PASSES');
if (QojUsers.length !== QojPasses.length) {
  throw new Error('QOJ_USERS and QOJ_PASSES must have the same number of comma-separated entries');
}
if (new Set(QojUsers).size !== QojUsers.length) {
  throw new Error('QOJ_USERS contains duplicate accounts; each entry must be a distinct account');
}
export const EncryptionKey = Buffer.from(validateEnv('ENCRYPTION_KEY', false), 'hex');
export const GmailUsername = validateEnv('GMAIL_USER', false);
export const GmailPassword = validateEnv('GMAIL_PASS', false);
export const RootUrl = validateEnv('ROOT_URL');

function validatePython() {
  // check runtime
  const check = spawnSync('python3', ['--version']);
  if (check.error) {
    throw new Error('`python3` not found. Please ensure `python3` is installed and available in PATH');
  }
  const version = `v${check.stdout.toString().trim().split(' ')[1]}`;
  console.log(`[ok] python3 runtime: ${version}`);
  // check deps
  const verify = spawnSync('python3', [path.resolve(root, 'src/verify.py')], { encoding: 'utf8' });
  if (verify.error) {
    throw new Error('Failed to run verify.py. Does the file exist?');
  }
  if (verify.status != 0) {
    console.error(verify.stderr);
    throw new Error('Python dependency check failed');
  }
  console.log(verify.stdout);
}

validatePython();

type ContextField = {
  key: string;
  label: string;
  type: 'select';
  options: readonly string[];
  optionLabels: readonly string[];
};

type ContextDisplay = {
  label: string;
  negative: string;
  positive: string;
};

type ContestContext = {
  fields: readonly ContextField[];
  display: ContextDisplay;
};

const icoFields = [
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: ['male', 'female'] as const,
    optionLabels: ['Male', 'Female'] as const
  },
  {
    key: 'grade',
    label: 'Grade',
    type: 'select',
    options: ['12', '11', '10', '9', '8', '7'] as const,
    optionLabels: ['12th or above', '11th', '10th', '9th', '8th', '7th or below'] as const
  }
] as const;

export const contestContexts: Record<string, ContestContext> = {
  zco: {
    fields: icoFields,
    display: {
      label: 'Qualified for INOI',
      negative: 'No',
      positive: 'Yes'
    }
  },
  inoi: {
    fields: icoFields,
    display: {
      label: 'Qualified for IOITC',
      negative: 'No',
      positive: 'Yes'
    }
  }
} as const;

export const mail = {
  transporter: GmailUsername && GmailPassword ? nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: GmailUsername, pass: GmailPassword }
  }) : null,
  async send(opts: nodemailer.SendMailOptions) {
    if (!this.transporter) {
      throw new Error('Email not configured (missing GMAIL_USER/GMAIL_PASS in .env)');
    }
    return this.transporter.sendMail(opts);
  }
};