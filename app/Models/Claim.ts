import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * Somebody saying a listed business is theirs.
 *
 * The funnel from the listing half to the partner half: a real business finds
 * itself on the site, says so, and an admin decides. It is a request rather
 * than an action, because approving it hands over control of a page about a
 * real place, and that must never be self-serve.
 *
 * Nothing here emails the business. Contact details on the listing came from
 * open data, and using them to send mail about a demonstration would be
 * exactly the thing this app is careful not to do.
 */
export default defineModel({
  name: 'Claim',
  table: 'claims',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'businessId', 'status', 'claimantName', 'createdAt'],
      searchable: ['claimantName', 'claimantEmail'],
      sortable: ['createdAt'],
      filterable: ['status', 'businessId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Anyone may ask; only staff may read the queue or decide.
      middleware: { read: ['auth'], write: [] },
      uri: 'claims',
    },

    observe: true,
  },

  belongsTo: ['Business'],

  attributes: {
    status: {
      order: 1,
      required: true,
      fillable: true,
      default: 'pending',
      validation: {
        rule: schema.enum(['pending', 'approved', 'rejected']),
        message: { enum: 'Status must be one of: pending, approved, rejected' },
      },
      factory: () => 'pending',
    },

    claimantName: {
      order: 2,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(120) },
      factory: faker => faker.person.fullName(),
    },

    claimantEmail: {
      order: 3,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(160) },
      factory: faker => faker.internet.email(),
    },

    /** Their case: role, how to verify it, anything else. */
    message: {
      order: 4,
      fillable: true,
      validation: { rule: schema.string().max(2000) },
      factory: () => '',
    },

    decidedAt: {
      order: 5,
      fillable: true,
      validation: { rule: schema.timestamp() },
      factory: () => null,
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)
