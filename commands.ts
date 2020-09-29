// -- This is a parent command --
import "cypress-file-upload";

Cypress.Screenshot.defaults({
  screenshotOnRunFailure: false,
});

Cypress.Commands.add('goToRoute', (route = '') => {
  return cy
    .window()
    .its('tgHistory')
    .invoke('push', route);
});

/** For PWA */
Cypress.Commands.add('google', () => {
  cy.route({
    method: 'GET',
    url: 'https://google.com',
    status: 200,
    response: {},
  });
});

Cypress.Commands.add('waitWhenApiRequestComplete', () => {
  /**
   * If you pass a function as a parameter when calling should(), Cypress will retry that
   * function continuously within the timeout you provided, until the expectation inside
   * that function is met.
   *
   * Note: the purpose of get('body') here is just to pass the timeout to the should() call,
   * basically you can get any element on the page.
   */
  const timeout = Cypress.env('apiMaxWaitingTime') || 60 * 1000;
  cy.log('Waiting for pending api requests:');
  cy.get('body', { timeout, log: false }).should(() => {
    expect(cy._apiCount).to.eq(0);
  });
});
