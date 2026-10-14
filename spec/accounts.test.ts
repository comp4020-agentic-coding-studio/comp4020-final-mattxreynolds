import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { expect, inject, it } from "vitest";
import { startSecondServer } from "./helpers/second-server.ts";
import { guest, post, type Sailor, type Started } from "./helpers/voyage.ts";

const baseUrl = inject("baseUrl");

let counter = 0;
const username = (): string => `Sailor_${Date.now().toString(36)}${counter++}`;
const PASSWORD = "correct horse battery";

const get = (base: string, path: string, cookie: string | null): Promise<Response> =>
  fetch(new URL(path, base), { headers: cookie ? { cookie } : {} });

const cookieOf = (res: Response): string => res.headers.getSetCookie()[0].split(";")[0];

async function upgrade(base: string, who: Sailor, name = username(), password = PASSWORD): Promise<{ res: Response; name: string }> {
  return { res: await post(base, "/api/account", who.cookie, { username: name, password }), name };
}

it("a Guest upgrades in place and keeps the public id, unfinished Voyages and Finished history", async () => {
  const who = await guest(baseUrl);
  const open = (await (await post(baseUrl, "/api/voyages", who.cookie, {})).json()) as Started;
  const done = (await (await post(baseUrl, "/api/voyages", who.cookie, {})).json()) as Started;
  const ended = await post(baseUrl, `/api/voyages/${done.id}/intents`, who.cookie, { kind: "end-voyage", seq: 0 });
  expect(ended.status).toBe(200);

  const { res } = await upgrade(baseUrl, who);
  expect(res.status).toBe(200);
  const person = (await res.json()) as { id: string; name: string; account?: boolean };
  expect(person.id).toBe(who.id);
  expect(person.account).toBe(true);

  const me = (await (await get(baseUrl, "/api/me", who.cookie)).json()) as { id: string; account?: boolean };
  expect(me).toMatchObject({ id: who.id, account: true });
  const voyages = (await (await get(baseUrl, "/api/voyages", who.cookie)).json()) as {
    unfinished: { id: string }[];
    finished: { id: string }[];
  };
  expect(voyages.unfinished.map((v) => v.id)).toEqual([open.id]);
  expect(voyages.finished.map((v) => v.id)).toEqual([done.id]);
});

it("refuses a bad username or password (400), a taken username in any case (409) and a second upgrade (409)", async () => {
  const who = await guest(baseUrl);
  expect((await upgrade(baseUrl, who, "ab")).res.status).toBe(400);
  expect((await upgrade(baseUrl, who, "has space")).res.status).toBe(400);
  expect((await upgrade(baseUrl, who, "a".repeat(21))).res.status).toBe(400);
  expect((await upgrade(baseUrl, who, username(), "short")).res.status).toBe(400);
  expect((await post(baseUrl, "/api/account", null, { username: username(), password: PASSWORD })).status).toBe(401);

  const first = await upgrade(baseUrl, who);
  expect(first.res.status).toBe(200);
  expect((await upgrade(baseUrl, who)).res.status).toBe(409);

  const other = await guest(baseUrl);
  expect((await upgrade(baseUrl, other, first.name.toUpperCase())).res.status).toBe(409);
});

it("signing in on a second browser shows the same profile, and signing out ends only that browser", async () => {
  const first = await guest(baseUrl);
  const { name } = await upgrade(baseUrl, first);
  const voyage = (await (await post(baseUrl, "/api/voyages", first.cookie, {})).json()) as Started;

  const signin = await post(baseUrl, "/api/signin", null, { username: name.toLowerCase(), password: PASSWORD });
  expect(signin.status).toBe(200);
  const cookie = cookieOf(signin);
  expect(signin.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
  expect(cookie).not.toBe(first.cookie);
  expect(await signin.json()).toMatchObject({ id: first.id, name: first.name, account: true });
  const voyages = (await (await get(baseUrl, "/api/voyages", cookie)).json()) as { unfinished: { id: string }[] };
  expect(voyages.unfinished.map((v) => v.id)).toEqual([voyage.id]);

  const out = await post(baseUrl, "/api/signout", cookie);
  expect(out.status).toBe(200);
  expect((await get(baseUrl, "/api/me", cookie)).status).toBe(401);
  expect((await get(baseUrl, "/api/me", first.cookie)).status).toBe(200);
});

it("a wrong password or unknown username is 401 with the same body", async () => {
  const who = await guest(baseUrl);
  const { name } = await upgrade(baseUrl, who);
  const wrong = await post(baseUrl, "/api/signin", null, { username: name, password: "not the password" });
  const unknown = await post(baseUrl, "/api/signin", null, { username: username(), password: PASSWORD });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(await wrong.json()).toEqual(await unknown.json());
});

it("repeated failed sign-ins are throttled with 429, even for the right password, and only for that username", async () => {
  const who = await guest(baseUrl);
  const { name } = await upgrade(baseUrl, who);
  const bad = { username: name, password: "wrong password" };
  for (let i = 0; i < 5; i++) expect((await post(baseUrl, "/api/signin", null, bad)).status).toBe(401);
  expect((await post(baseUrl, "/api/signin", null, bad)).status).toBe(429);
  expect((await post(baseUrl, "/api/signin", null, { username: name, password: PASSWORD })).status).toBe(429);

  const other = await guest(baseUrl);
  const { name: otherName } = await upgrade(baseUrl, other);
  expect((await post(baseUrl, "/api/signin", null, { username: otherName, password: PASSWORD })).status).toBe(200);
});

it("no password or token reaches the events table or stdout, and the password is stored hashed apart from the Person", async () => {
  const server = await startSecondServer();
  const who = await guest(server.url);
  const secret = "hunter2-but-longer-9Z";
  const name = username();
  await post(server.url, "/api/account", who.cookie, { username: name, password: secret });
  const signin = await post(server.url, "/api/signin", null, { username: name, password: secret });
  const token = cookieOf(signin).split("=")[1];
  await post(server.url, "/api/signin", null, { username: name, password: "wrong-wrong-wrong" });
  await post(server.url, "/api/signout", cookieOf(signin));
  await server.stop();

  const db = new DatabaseSync(join(server.dataDir, "game.db"), { readOnly: true });
  const rows = db.prepare("SELECT actor, action, detail FROM event ORDER BY id").all() as { actor: string | null; action: string; detail: string }[];
  const person = db.prepare("SELECT * FROM person").all();
  const creds = JSON.stringify(db.prepare("SELECT * FROM account").all());
  db.close();

  const actions = rows.map((r) => r.action);
  expect(actions).toEqual(expect.arrayContaining(["account.created", "signin.ok", "signin.failed", "signout"]));
  for (const text of [JSON.stringify(rows), server.output()]) {
    for (const s of [secret, "wrong-wrong-wrong", token, who.cookie.split("=")[1]]) expect(text).not.toContain(s);
  }
  expect(JSON.stringify(person)).not.toContain(secret);
  expect(creds).not.toContain(secret);
});

it("on the profile screen a Guest creates an Account, a second browser signs in to the same profile, and sign-out affects only one", async () => {
  const browser = await chromium.launch();
  try {
    const one = await (await browser.newContext()).newPage();
    await one.goto(baseUrl);
    await one.getByRole("button", { name: "Play as guest" }).click();
    await one.getByTestId("player-name").waitFor();
    const playerName = await one.getByTestId("player-name").inputValue();
    await one.getByRole("button", { name: "Start a Voyage" }).click();
    await one.getByTestId("ship-name").waitFor();
    await one.goto(baseUrl);

    const name = username();
    await one.getByLabel("Username").fill(name);
    await one.getByLabel("Password").fill(PASSWORD);
    await one.getByRole("button", { name: "Create account" }).click();
    await one.getByRole("button", { name: "Sign out" }).waitFor();
    expect(await one.getByTestId("player-name").inputValue()).toBe(playerName);
    expect(await one.getByTestId("unfinished-voyage").count()).toBe(1);

    const two = await (await browser.newContext()).newPage();
    await two.goto(baseUrl);
    await two.getByRole("button", { name: "Sign in" }).click();
    await two.getByLabel("Username").fill(name);
    await two.getByLabel("Password").fill(PASSWORD);
    await two.getByRole("button", { name: "Sign in" }).last().click();
    await two.getByRole("button", { name: "Sign out" }).waitFor();
    expect(await two.getByTestId("player-name").inputValue()).toBe(playerName);
    await two.getByTestId("unfinished-voyage").waitFor();

    await two.getByRole("button", { name: "Sign out" }).click();
    await two.getByRole("button", { name: "Play as guest" }).waitFor();
    await one.reload();
    await one.getByRole("button", { name: "Sign out" }).waitFor();
  } finally {
    await browser.close();
  }
});
