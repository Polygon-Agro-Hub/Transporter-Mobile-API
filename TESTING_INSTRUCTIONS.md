# Unit Testing Guide

This project uses [Jest](https://jestjs.io/) for unit testing. 
Jest is a popular Javascript testing framework that requires zero configuration.

## Pre-requisites
Ensure you have all dependencies installed:

```bash
npm install
```

## Running the Tests
To execute the full test suite, simply run:

```bash
npm run test
```
*(This is mapped to the `jest` command in your `package.json`'s scripts).*

If you want Jest to automatically re-run tests when files change (useful during development):
```bash
npx jest --watchAll
```

## Test Structure
Tests are located in the `tests/` directory and are named based on the file they test. For example:
- `endpoint/userAuth-ep.js` -> `tests/endpoint/userAuth-ep.test.js`

### What is Tested?
We are testing **"Endpoints"**, which means we test the functions that take Express `req` and `res` objects.
To test these properly without needing a database connection or a running server, we use Mocking.

- **Request & Response Mocking:** We mock `req` (simulating different `body` payloads or `user` session variables) and `res` (monitoring what the endpoint responds with, like `.status(200)` and `.json({...})`).
- **DAO Mocking:** Database Data Access Objects (`*-dao.js`) are mocked so that we can force them to successfully return data or simulate database errors (`.mockResolvedValue` or `.mockRejectedValue`).

### Example of Adding a New Test
If you create a new endpoint, follow this pattern:

```javascript
describe('New Endpoint Name', () => {
  it('should return error if unauthorized', async () => {
    // 1. Setup Mock Request (e.g., no user context)
    const req = mockRequest({ name: 'test' }, null);
    
    // 2. Call the function
    await myEndpointFunction(req, res);
    
    // 3. Asset the expected outcome
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

## Coverage Addressed
The current scripts encompass all combinations and validations for User Auth and Complaint routes, including:
- Missing fields (No empId, No file payload).
- Improper inputs (File size too large, unsupported mime types).
- Success paths (Database handles correctly).
- Error paths (Database throws or item not found).
