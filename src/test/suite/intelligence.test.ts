import * as assert from 'assert';
import * as vscode from 'vscode';
import { KetchupApiClient } from '../../api/KetchupApiClient';

suite('Intelligence Platform Test Suite', () => {
	vscode.window.showInformationMessage('Start Intelligence tests.');

	test('getIntelligenceSummary transforms momentum data correctly', async () => {
		const client = new KetchupApiClient();
		
		// Mock axios instance
		(client as any).axios = {
			get: async (url: string) => {
				if (url.includes('momentum')) {
					return {
						data: {
							score: 1.25,
							grade: 'A',
							velocity_growth_percent: 15.0,
							complexity_growth_percent: 5.0,
							interpretation: 'Excellent progress',
							period: {
								start: '2023-01-01',
								end: '2023-01-07'
							},
							velocity_pulse: {
								total_commits: 50,
								contributors: []
							},
							health_trend: {
								delta: 5,
								breakdown: {
									security_fixes: 2,
									dead_code_removed: 100
								}
							}
						}
					};
				}
				throw new Error(`Unexpected URL: ${url}`);
			},
			interceptors: {
				request: { use: () => {} },
				response: { use: () => {} }
			}
		};

		const summary = await client.getIntelligenceSummary('test-project-id');

		assert.strictEqual(summary.momentum.score, 1.25);
		assert.strictEqual(summary.momentum.grade, 'A');
		assert.strictEqual(summary.momentum.interpretation, 'Excellent progress');
		assert.strictEqual(summary.momentum.velocity_growth, 15.0);
		// Verify helper method extractMomentumHighlights logic by checking result structure
		assert.ok(summary.momentum.highlights, 'Highlights should be generated');
	});

	test('getForensics transforms security data correctly', async () => {
		const client = new KetchupApiClient();
		
		(client as any).axios = {
			get: async (url: string) => {
				return {
					data: {
						code_vitals: { items: [], total: 0 },
						security_alerts: {
							total: 5,
							by_severity: { critical: 1, high: 2, medium: 1, low: 1 }
						},
						dead_code: { estimated_lines: 100 },
						quick_wins: []
					}
				};
			},
			interceptors: {
				request: { use: () => {} },
				response: { use: () => {} }
			}
		};

		const forensics = await client.getForensics('test-project-id');
		
		assert.strictEqual(forensics.security_summary.total_vulnerabilities, 5);
		assert.strictEqual(forensics.security_summary.critical, 1);
		// Check computed grade logic
		assert.strictEqual(forensics.security_summary.grade, 'F', 'Expected F grade for critical vulnerabilities');
	});

	test('getSkillsGraph transforms contributor data correctly', async () => {
		const client = new KetchupApiClient();
		
		(client as any).axios = {
			get: async (url: string) => {
				return {
					data: {
						contributors: [
							{ username: 'alice', commits_count: 50, primary_language: 'TypeScript' },
							{ username: 'bob', commits_count: 30, primary_language: 'Python' }
						],
						team_size: 2,
						bus_factor: 1,
						language_distribution: { TypeScript: 60, Python: 40 }
					}
				};
			},
			interceptors: {
				request: { use: () => {} },
				response: { use: () => {} }
			}
		};

		const skills = await client.getSkillsGraph('test-project-id');
		
		assert.strictEqual(skills.team_size, 2);
		assert.strictEqual(skills.contributors.length, 2);
		assert.strictEqual(skills.contributors[0].username, 'alice');
		assert.strictEqual(skills.contributors[0].commits, 50);
	});
});
