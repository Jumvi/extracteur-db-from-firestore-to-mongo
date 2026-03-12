import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class AuditService {
  runStrict(opts: any) {
    return this.spawnScript('strict-audit.sh', []);
  }

  runRepair(opts: any) {
    const args: string[] = [];
    if (opts.input) {
      args.push('--input-ndjson', String(opts.input));
    }
    if (opts.uuid) {
      args.push('--uuid', String(opts.uuid));
    }
    return this.spawnScript('repair-from-ndjson.sh', args);
  }

  status(id: string) {
    const p = path.join(process.cwd(), 'tmp', `job_${id}.log`);
    if (fs.existsSync(p)) {
      return { id, log: fs.readFileSync(p, 'utf8') };
    }
    return { id, status: 'unknown' };
  }

  private spawnScript(name: string, args: string[]) {
    const script = path.join(process.cwd(), 'scripts', 'commands', name);
    const id = String(Date.now());
    const outLog = path.join(process.cwd(), 'tmp', `job_${id}.log`);
    const child = spawn(script, args, { env: process.env, shell: true });
    const chunks: string[] = [];
    child.stdout.on('data', (d) => chunks.push(String(d)));
    child.stderr.on('data', (d) => chunks.push(String(d)));
    child.on('close', (code) => {
      chunks.push(`exit ${code}`);
      try { fs.writeFileSync(outLog, chunks.join('')); } catch (e) { /* ignore */ }
    });
    return { id, pid: child.pid };
  }
}
