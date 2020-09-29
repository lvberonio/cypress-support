import './commands';
import './util';
import './autoStubApi';
import './commonRoutes';

Cypress.on('uncaught:exception', (err, runnable) => {
  console.log(err)
  console.log(runnable)
  // returning false here prevents Cypress from
  // failing the test
  return false
});