import { test, expect } from '@playwright/test';

/**
 * editor.spec.ts — Smoke test for the ReceiptDesigner editor.
 *
 * This is an end-to-end test that verifies the app loads correctly in a real browser.
 * No server is required — the test runs against the built dist/ served by the
 * webServer config in playwright.config.ts.
 *
 * API calls are not mocked here because in demo mode there are no API calls —
 * the app uses localStorage only. See playwright.config.ts for the webServer setup.
 */

test.describe('App shell', () => {
  test('loads and shows the top bar', async ({ page }) => {
    await page.goto('/');

    // The app name should be visible in the top bar
    await expect(page.getByText('ReceiptDesigner')).toBeVisible();
  });

  test('shows the Demo mode badge', async ({ page }) => {
    await page.goto('/');

    // In demo mode, a "Demo" badge is shown in the top bar
    await expect(page.getByText('Demo')).toBeVisible();
  });

  test('shows the document list sidebar', async ({ page }) => {
    await page.goto('/');

    // The Documents heading in the sidebar should be visible
    await expect(page.getByText('Documents')).toBeVisible();
  });

  test('shows the Preview pane label', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Preview')).toBeVisible();
  });

  test('shows the Printer Settings panel', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Printer Settings')).toBeVisible();
  });
});
