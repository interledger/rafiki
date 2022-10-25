exports.up = function (knex) {
  return knex.raw(
    "CREATE TYPE \"access_action\" AS ENUM ('create', 'read', 'read-all', 'list', 'list-all', 'complete')"
  )
}

exports.down = function (knex) {
  return knex.raw('DROP TYPE "access_action"')
}
