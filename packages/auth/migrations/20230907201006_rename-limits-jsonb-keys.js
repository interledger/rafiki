exports.up = function (knex) {
  // renames sendAmount keys (if any) to debitAmount in limits jsonb column
  return knex('accesses')
    .update({
      limits: knex.raw(
        "limits - 'sendAmount' || jsonb_build_object('debitAmount', limits->'sendAmount')"
      )
    })
    .whereRaw("limits \\? 'sendAmount'")
}

exports.down = function (knex) {
  // renames debitAmount keys (if any) to sendAmount in limits jsonb column
  return knex('accesses')
    .update({
      limits: knex.raw(
        "limits - 'debitAmount' || jsonb_build_object('sendAmount', limits->'debitAmount')"
      )
    })
    .whereRaw("limits \\? 'debitAmount'")
}
