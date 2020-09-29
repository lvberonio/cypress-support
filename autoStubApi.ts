function getFixtureName(spec: any) {
  const specName = spec.name.replace('integration/', '')
      .replace('.spec.ts', '');

  return `${specName}.api.snapshot.json`;
}

before(() => {
  cy.log('Load polyfill for mocking fetch:');
  let polyfill: any;
  /**
   * Cypress does not support monitor Fetch API request right now (see
   * https://github.com/cypress-io/cypress/issues/95), so here we need
   * to manually load a polyfill Fetch to make sure Fetch API will fallback
   * to XHR, which Cypress can monitor.
   */
  const polyfillUrl = 'https://unpkg.com/unfetch/dist/unfetch.umd.js';
  cy.request(polyfillUrl).then(response => {
    polyfill = response.body;
  });
  Cypress.on('window:before:load', win => {
    delete win.fetch;
    (win as any).eval(polyfill);
    win.fetch = (win as any).unfetch;
  });
});

// do not use arrow function because we need to use `this` inside
beforeEach(function() {
  const forceApiRecording: boolean = Cypress.env('forceApiRecording');
  /**
   * Recording mode is on when:
   *   `forceApiRecording` flag is True, or
   *   Fixture for this test case is not existed (same as Jest snapshot test)
   *
   * `forceApiRecording` is a flag you can use to update fixture
   */
      // a promise which will resolve value for isInRecordingMode
  let isRecordingModePromise;

  // test case information
  const testFileInfo = Cypress.spec;
  const fixtureName = getFixtureName(testFileInfo);
  const fixturePath = `cypress/fixtures/${fixtureName}`;
  console.log(fixturePath, 'fixtureName');
  const testCaseTitle = this.currentTest ? this.currentTest.fullTitle() : '';

  if (forceApiRecording) {
    isRecordingModePromise = Cypress.Promise.resolve(true);
  } else {
    isRecordingModePromise = cy.task('doesFixtureExist', fixturePath, { log: false })
        .then(doesFixtureExist => {
          if (!doesFixtureExist) {
            // turn on recording if fixture file is not existed
            return true;
          } else {
            // check if there is a key which name is the same as this test case
            return cy.readFile(fixturePath, { log: false })
                .then((apiRecords: apiSnapshotFixture) => {
                  // turn on recording if fixture for this test case is not existed
                  return !apiRecords[testCaseTitle];
                });
          }
        });
  }

  // cy.task() does not return Promise, need to use any to bypass type check
  (isRecordingModePromise as any).then((isRecordingMode: boolean) => {
    cy._isRecordingMode = isRecordingMode;

    cy.log(`API auto recording: ${isRecordingMode ? 'ON' : 'OFF'}`);

    if (isRecordingMode) {
      cy.log('Use real API response.');
    } else {
      cy.log(`Use recorded API response: ${fixtureName}`);
    }

    cy._apiData = [];
    cy._apiCount = 0;
    cy.server({
      onRequest: () => {
        cy._apiCount++;
      },
      onResponse: (xhr: any) => {
        /**
         * There are sometimes windows between API requests, e.g. First request finishes,
         * but second request starts after 100ms, in this case, cy.waitWhenApiRequestComplete() would
         * not work correctly, so when we decrease the counter, we need to have a delay here.
         */
        const delayTime = isRecordingMode ? 500 : 0;
        if (cy._apiCount === 1) {
          setTimeout(() => {
            cy._apiCount--;
          }, delayTime);
        } else {
          cy._apiCount--;
        }

        if (isRecordingMode) {
          /**
           * save URL without the host info, because API host might be different between
           * Record and Replay session
           */
          let url = '';
          let matchHostIndex: number = -1;
          const apiHost = Cypress.env('apiHost').split(',');

          for (let i = 0; i < apiHost.length; i++) {
            const host = apiHost[i].trim();
            if (xhr.url.includes(host)) {
              url = xhr.url.replace(host, '');
              matchHostIndex = i;
              break;
            }
          }

          const method = xhr.method;
          const status = xhr.status;
          const request = {
            body: xhr.request.body,
          };
          const response = {
            body: xhr.response.body,
          };

          // save API request/response into an array so we can write these info to fixture
          cy._apiData.push({
            url,
            method,
            status,
            request,
            response,
            matchHostIndex,
          });
        }
      },
    });

    if (isRecordingMode) {
      const stubApiPatterns = Cypress.env('stubApiPatterns').split(',');
      stubApiPatterns.forEach((pattern: string) => {
        const apiRegex = new RegExp(pattern.trim());

        // let Cypress stub all API requests which match the pattern defined in cypress.json
        cy.route('GET', apiRegex);
        cy.route('POST', apiRegex);
        cy.route('PUT', apiRegex);
        cy.route('DELETE', apiRegex);
      });
    } else {
      const apiHost = Cypress.env('apiHost').split(',');

      cy.fixture(fixtureName).then((apiRecords: apiSnapshotFixture) => {
        apiRecords[testCaseTitle].records.forEach(apiRecord => {
          if (apiRecord.method !== 'get' && apiHost[apiRecord.matchHostIndex]) {
            console.log('apiRecord.method', apiRecord.method);
            console.log('apiRecord', apiHost[apiRecord.matchHostIndex]);

            const fullUrl = `${apiHost[apiRecord.matchHostIndex].trim()}${apiRecord.url}`;
            cy.route({
              method: apiRecord.method,
              url: fullUrl,
              status: apiRecord.status,
              response: apiRecord.response.body,
            });
          }
        });
      });
    }
  });
});

// do not use arrow function because we need to use `this` inside
afterEach(function() {
  // only save api data to fixture when test is passed
  if (this.currentTest && this.currentTest.state === 'passed' && cy._isRecordingMode) {
    const testFileInfo = Cypress.spec;
    const fixtureName = getFixtureName(testFileInfo);
    const fixturePath = `cypress/fixtures/${fixtureName}`;
    const testCaseTitle = this.currentTest ? this.currentTest.fullTitle() : '';

    // if fixture file exists, only update the data related to this test case
    cy.task('doesFixtureExist', fixturePath, { log: false })
        .then(doesFixtureExist => {
          if (doesFixtureExist) {
            cy.readFile(fixturePath, { log: false })
                .then((apiRecords: apiSnapshotFixture) => {
                  apiRecords[testCaseTitle] = {
                    timestamp: new Date().toJSON(),
                    records: cy._apiData,
                  };
                  cy.writeFile(fixturePath, apiRecords, { log: false });
                });
          } else {
            cy.writeFile(
                fixturePath,
                {
                  [testCaseTitle]: {
                    timestamp: new Date().toJSON(),
                    records: cy._apiData,
                  },
                },
                { log: false }
            );
          }

          cy.log('API recorded', cy._apiData);
        });
  }
});