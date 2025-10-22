interface BaseSubjectRequest {
  format: string
  id: string
}

export type SubjectRequest = BaseSubjectRequest
export type SubjectItem = BaseSubjectRequest
export type SubjectResponse = {
  sub_ids: BaseSubjectRequest[]
}
