import * as assert from 'assert';
import * as vscode from 'vscode';
import { KetchupApiClient } from '../../api/KetchupApiClient';

suite('Extended VS Code Tests', () => {
	vscode.window.showInformationMessage('Start extended tests.');

	test('Empty state detection - zero commits', async () => {
		const client = new KetchupApiClient();
		
		(client as any).axios = {
			get: async (url: string) => {
				return {
					data: {
						score: 1.0,
						grade: 'C',
						velocity_pulse: { total_commits: 0, contributors: [] },
						health_trend: { delta: 0 }
					}
				};
			},
			interceptors: { request: { use: () => {} }, response: { use: () => {} } }
		};

		const summary = await client.getIntelligenceSummary('empty-project');
		assert.strictEqual(summary.velocity_pulse.total_commits, 0);
	});

	test('Error handling - API failure', async () => {
		const client = new KetchupApiClient();
		
		(client as any).axios = {
			get: async () => {
				throw new Error('Network error');
			},
			interceptors: { request: { use: () => {} }, response: { use: () => {} } }
		};

		await assert.rejects(
			async () => await client.getIntelligenceSummary('failing-project'),
			Error
		);
	});

	test('Skills graph - empty contributors', async () => {
		const client = new KetchupApiClient();
		
		(client as any).axios = {
			get: async () => ({
				data: {
					contributors: [],
					team_size: 0,
					bus_factor: 0,
					language_distribution: {}
				}
			}),
			interceptors: { request: { use: () => {} }, response: { use: () => {} } }
		};

		const skills = await client.getSkillsGraph('no-team-project');
		assert.strictEqual(skills.contributors.length, 0);
		assert.strictEqual(skills.team_size, 0);
	});

	test('Forensics - all-clear scenario', async () => {
		const client = new KetchupApiClient();
		
		(client as any).axios = {
			get: async () => ({
				data: {
					code_vitals: { items: [], total: 0 },
					security_alerts: { total: 0, by_severity: { critical: 0, high: 0, medium: 0, low: 0 } },
					dead_code: { estimated_lines: 0 },
					quick_wins: []
				}
			}),
			interceptors: { request: { use: () => {} }, response: { use: () => {} } }
		};

		const forensics = await client.getForensics('clean-project');
		assert.strictEqual(forensics.security_summary.total_vulnerabilities, 0);
		assert.strictEqual(forensics.security_summary.grade, 'A');
	});
});
