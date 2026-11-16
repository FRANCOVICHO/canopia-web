import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { onRequestPost as submitOrder } from "./functions/api/orders.js";
import { onRequest as account } from "./functions/api/auth.js";
import { cartItems, changePendingOrder } from "./functions/_lib/order-integrity.js";
import { buildProductHtml } from "./functions/_lib/seo.js";
import { signJwt, verifyJwt } from "./functions/_lib/jwt.js";

function createDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  sql.exec("INSERT INTO products (id, name, category, price, stock) VALUES ('a','A','grow',900,4),('b','B','grow',1200,1)");
  return {
    sql,
    prepare(query) {
      const statement = sql.prepare(query);
      const wrapper = (params) => ({
        bind: (...bound) => wrapper(bound),
        first: async () => statement.get(...params),
        all: async () => ({ results: statement.all(...params) }),
        run: async () => {
          const result = statement.run(...params);
          return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
        },
        execute: () => statement.columns().length ? statement.all(...params) : statement.run(...params),
      });
      return wrapper([]);
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function post(path, body, authorization) {
  return new Request(`https://canopiagrow.com/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization && { Authorization: authorization }) },
    body: JSON.stringify(body),
  });
}

test("validates integer quantities, consolidates repeated items and calculates prices on the server", async () => {
  const db = createDb();
  const customer = { name: "QA", phone: "2920000000" };
  assert.equal(cartItems([{ id: "a", quantity: 1.5 }]), null);
  assert.equal(cartItems([{ id: "a", quantity: -1 }]), null);
  assert.equal(cartItems([{ id: "a", quantity: "Infinity" }]), null);
  const response = await submitOrder({
    request: post("orders", { customer, user_id: "other", items: [{ id: "a", quantity: 1, price: 1 }, { id: "a", quantity: 2 }] }),
    env: { canopia_db: db },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 2700);
  assert.equal(data.status, "pendiente");
  assert.equal(db.sql.prepare("SELECT user_id FROM orders").get().user_id, null);
  assert.equal(db.sql.prepare("SELECT stock FROM products WHERE id='a'").get().stock, 4);
  const oversold = await submitOrder({
    request: post("orders", { customer, items: [{ id: "b", quantity: 1 }, { id: "b", quantity: 1 }] }),
    env: { canopia_db: db },
  });
  assert.equal(oversold.status, 409);
});

test("an unsuccessful item rolls back all deductions and a duplicate confirmation discounts once", async () => {
  const db = createDb();
  const insert = db.sql.prepare("INSERT INTO orders (customer_name,customer_phone,total,status,items_json) VALUES ('QA','0',0,'pendiente',?)");
  const bad = insert.run(JSON.stringify([{ id: "a", quantity: 2 }, { id: "b", quantity: 2 }])).lastInsertRowid;
  const good = insert.run(JSON.stringify([{ id: "a", quantity: 2 }])).lastInsertRowid;
  const getOrder = (id) => db.sql.prepare("SELECT * FROM orders WHERE id=?").get(id);
  assert.equal(await changePendingOrder(db, getOrder(bad), "confirmado"), false);
  assert.equal(getOrder(bad).status, "pendiente");
  assert.equal(db.sql.prepare("SELECT stock FROM products WHERE id='a'").get().stock, 4);
  const stale = getOrder(good);
  assert.deepEqual(await Promise.all([changePendingOrder(db, stale, "confirmado"), changePendingOrder(db, stale, "confirmado")]), [true, false]);
  assert.equal(await changePendingOrder(db, stale, "rechazado"), false);
  assert.equal(getOrder(good).status, "confirmado");
  assert.equal(db.sql.prepare("SELECT stock FROM products WHERE id='a'").get().stock, 2);
});

test("recovery delegates to PocketBase, never returns credentials and rejects the legacy code flow", async (t) => {
  const emails = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/users\/request-password-reset$/);
    const { email } = JSON.parse(options.body);
    emails.push(email);
    return email.startsWith("exists") ? new Response(null, { status: 204 })
      : Response.json({ code: "internal details" }, { status: 400 });
  });
  const existing = await account({ request: post("auth?action=forgot", { email: "exists@example.com" }), env: {} });
  const missing = await account({ request: post("auth?action=forgot", { email: "missing@example.com" }), env: {} });
  assert.equal(existing.status, 200);
  assert.equal(missing.status, 200);
  const body = await existing.json();
  assert.deepEqual(body, await missing.json());
  assert.deepEqual(Object.keys(body), ["ok", "message"]);
  assert.equal(existing.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(emails, ["exists@example.com", "missing@example.com"]);
  const old = await account({ request: post("auth?action=reset-password", { code: "123456" }), env: {} });
  assert.equal(old.status, 410);
});

test("purchase ownership comes from PocketBase and matching phones do not grant order access", async (t) => {
  const db = createDb();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/users\/auth-refresh$/);
    const token = options.headers.Authorization;
    return Response.json({ record: { id: token === "owner-token" ? "pb-owner" : "pb-other", phone: "123" } });
  });
  const order = await submitOrder({
    request: post("orders", { customer: { name: "QA", phone: "123" }, user_id: "pb-other", items: [{ id: "a", quantity: 1 }] }, "Bearer owner-token"),
    env: { canopia_db: db },
  });
  assert.equal(order.status, 200);
  assert.equal(db.sql.prepare("SELECT user_id FROM orders").get().user_id, "pb-owner");
  const get = (token) => account({
    request: new Request("https://canopiagrow.com/api/auth?action=orders", { headers: { Authorization: `Bearer ${token}` } }),
    env: { canopia_db: db },
  });
  assert.equal((await (await get("owner-token")).json()).orders.length, 1);
  assert.equal((await (await get("other-token")).json()).orders.length, 0);
});

test("malformed and expired JWTs fail closed", async () => {
  const secret = "test-only-secret";
  assert.equal(await verifyJwt("x.y.$", secret), null);
  assert.equal(await verifyJwt(await signJwt({ email: "test@example.com" }, secret, -1), secret), null);
  assert.equal((await verifyJwt(await signJwt({ email: "test@example.com" }, secret), secret)).email, "test@example.com");
});

test("JSON-LD cannot close the containing script element", () => {
  const name = '</script><img src=x onerror="alert(1)">';
  const html = buildProductHtml({ id: "qa", name, description: name, price: 100, stock: 1, image: "", category: "grow" }, "");
  assert(!html.includes(name));
  assert(html.includes("\\u003c/script>"));
});
