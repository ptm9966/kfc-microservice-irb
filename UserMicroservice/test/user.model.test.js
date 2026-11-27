const assert = require("node:assert/strict");
const test = require("node:test");
const database = require("../config/db");

let capturedRequests = [];
database.getPool = () => ({
    request() {
        const request = {
            parameters: {},
            input(name, type, value) {
                this.parameters[name] = { type, value };
                return this;
            },
            async query(statement) {
                capturedRequests.push({ parameters: this.parameters, statement });
                return { recordset: [{ id: "00000000-0000-4000-8000-000000000001" }] };
            },
        };
        return request;
    },
});

const Users = require("../features/user/user.model");

test.beforeEach(() => {
    capturedRequests = [];
});

test("findByMobile parameterizes the supplied mobile value", async () => {
    const mobile = "1' OR 1=1 --";
    await Users.findByMobile(mobile);

    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0].parameters.mobile.value, mobile);
    assert.match(capturedRequests[0].statement, /mobile\s*=\s*@mobile/);
    assert.equal(capturedRequests[0].statement.includes(mobile), false);
});

test("findById rejects malformed identifiers without querying SQL", async () => {
    const user = await Users.findById("not-a-guid");

    assert.equal(user, null);
    assert.equal(capturedRequests.length, 0);
});
