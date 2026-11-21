# A first hour for admins

This guide is for an admin who knows Flow Builder well and hasn't used the
Salesforce CLI, git or a coding agent yet. It takes you from nothing
installed to a coding agent that lists the automation on one of your objects
and audits one of your flows, working on a copy of your sandbox's metadata on
your own computer.

**Nothing in this guide changes your org.** Every step reads from it.

The guide was checked on 21 November 2026 on macOS, with Salesforce CLI
2.159.7 and Claude Code 2.1.330. The commands in steps 1 and 3 ran
against a Winter '27 (API 68.0) scratch org, and the scripts behind steps 4
and 5 ran on the project that step 3 created. If a command no longer matches
its reference page,
[open an issue](https://github.com/pariveo/salesforce-agent-skills/issues/new/choose)
and the step gets fixed.

Every command runs in a terminal. If you haven't used one before, Claude
Code's [terminal guide](https://code.claude.com/docs/en/terminal-guide) shows
how to open one and paste a command into it.

## 1. Install four things

**Salesforce CLI** signs your computer in to an org and copies metadata from
it. On macOS, install it with the `.pkg` file, and on Windows with the `.exe`
file, both linked from
[Install Salesforce CLI](https://developer.salesforce.com/docs/platform/sfdx-setup/guide/sfdx-setup-install-cli.html).
Then check that it answers. This prints the installed version:

```bash
sf --version
```

([Verify your installation](https://developer.salesforce.com/docs/platform/sfdx-setup/guide/sfdx-setup-install-cli.html#verify-your-installation-and-get-version-information))

**Node.js** runs the plugin's scripts: the Flow checker and the script that
lists an object's automation. Install the LTS version from
[nodejs.org](https://nodejs.org/en/download). This prints its version:

```bash
node --version
```

**Claude Code** is the coding agent. It needs a paid Claude plan or a Console
account. This downloads and installs it on macOS or Linux:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

On Windows, the same [setup page](https://code.claude.com/docs/en/setup#install-claude-code)
gives the PowerShell command. Open a new terminal window afterwards, so it
finds the `claude` command.

**The plugin** carries the two skills this guide uses. The first command
registers this repository as a plugin marketplace, and the second installs the
plugin from it
([Claude Code marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces#host-your-marketplace)):

```bash
claude plugin marketplace add pariveo/salesforce-agent-skills
```

```bash
claude plugin install salesforce-agent-skills@pariveo
```

## 2. Sign in to a sandbox

Use a sandbox, not production. A sandbox holds a copy of your production
metadata, so the flows you read are your own, and it's the org your team
already uses for trying out something new.

This opens the sandbox's login page in your browser. Once you've signed in,
the CLI can reach that org under the name `my-sandbox`:

```bash
sf org login web --alias my-sandbox --instance-url https://MyDomainName--SandboxName.sandbox.my.salesforce.com
```

Replace `MyDomainName` with your company's My Domain name and `SandboxName`
with the sandbox's name
([org login web](https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_login_web.html)).

## 3. Copy your automation into a local project

This creates a folder called `my-org-automation` with the files that mark it as
a Salesforce DX project
([template generate project](https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_template_generate_project.html)):

```bash
sf template generate project --name my-org-automation
```

Move into the folder. The next commands run from there:

```bash
cd my-org-automation
```

This copies the sandbox's flows, workflow rules and Apex triggers into the
project's `force-app` folder
([project retrieve start](https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_retrieve_start.html)).
It reads from the org and writes only on your computer:

```bash
sf project retrieve start --metadata Flow --metadata Workflow --metadata ApexTrigger --target-org my-sandbox
```

Those three types are what the plugin's two skills read. The command prints a
table of every file it created.

## 4. Ask for the automation on one object

Start Claude Code in the project folder. The first time, it asks you to sign
in and whether you trust the folder:

```bash
claude
```

Then ask, naming an object your team works with:

> List all the automation on Opportunity and the order it runs in.

The `salesforce-automation-mapper` skill answers this. It lists the object's
flows, processes, workflow rules and Apex triggers, groups them by the stage of
a save, and orders each stage by the platform's documented rules. It also
lists every field that more than one of them writes, and what the local files
can't show, such as automation from installed packages. It changes no file.
The [README](../README.md#salesforce-automation-mapper) describes it in full.

You can also ask the agent to explain any one flow in plain words. That works
well without a skill.

## 5. What to try next

Audit one of your own flows. The README's
[Try it](../README.md#try-it) section uses this prompt on a practice flow,
and it works the same on yours:

> Audit `Your_Flow_Name` for legacy patterns and tell me what to change first.
> Don't edit the file.

The `salesforce-flow-modernizer` skill runs the Flow checker, ranks what it
finds by impact and gives a replacement for each finding. It rewrites a flow
only when you ask, and then only the file on your computer.

The skills also run in Codex, as the README's
[Install for Codex](../README.md#install-for-codex) section describes.

## What this guide leaves out

Deploying, source control and team conventions aren't covered here. Teams
usually settle those together, and Pariveo's
[workshops](https://pariveo.eu/services/agentic-coding-workshops) set them up
with a team's admins and developers.
