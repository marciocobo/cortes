## Purpose

Ensures the OpenAI API key used by the Opção 3 (Blocos) n8n workflow is never
stored or transmitted as plain text within the workflow definition, so it is not
exposed through workflow exports, version history snapshots, or anyone with
read-only access to the workflow JSON.

## ADDED Requirements

### Requirement: OpenAI API key is stored as a credential, not a literal value
The workflow SHALL authenticate to the OpenAI API using an n8n credential
(`HTTP Header Auth` or the native OpenAI credential type) referenced by the `GPT
— Analisar Blocos` and `GPT — Seleção Final` HTTP Request nodes. Neither node's
`headerParameters` SHALL contain the literal API key value.

#### Scenario: Workflow JSON is exported or viewed in version history
- **WHEN** the workflow is exported to JSON, or a prior version is viewed via
  `get_workflow_version`/`get_workflow_history`
- **THEN** the exported/historical JSON contains a credential reference (e.g. a
  credential ID) for the OpenAI Authorization header, not the plain-text API key

#### Scenario: API key needs to be rotated
- **WHEN** the OpenAI API key needs to be rotated
- **THEN** the key is updated in exactly one place (the n8n credential), and no
  workflow node parameters need to be edited
