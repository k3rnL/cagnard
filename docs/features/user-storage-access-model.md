# User Storage Access Model

## Behavior

Cagnard separates user access through two independent storage tunnels:

- personal storage, shown as Home or My documents
- global storage, shown as administrator-defined shared roots

The tunnels are not mutually exclusive. A deployment can enable either or both.

## Configuration

Personal roots are declared under `personalStorage`. Global roots are declared under `globalStorage`.

Access can be scoped by:

- users
- roles
- groups

Personal roots can include placeholders such as `{user.id}` for per-user paths.

## Operational Notes

- Navigation labels come from root configuration.
- Operations keep tunnel and root context so actions are not ambiguous.
- Disabled or inaccessible tunnels are hidden instead of shown empty.

## Known Limitations

- Automatic provisioning modes are specified directionally but not fully implemented.
- Current local examples use one configured user and one local filesystem account.
