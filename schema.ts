import { defineSchema, collection, fields } from "@omg-dev/schema"

export default defineSchema({
  collections: {
    progress: collection({
      fields: {
        lessonId: fields.string(),
        done: fields.boolean(),
      },
    }),
    profile: collection({
      fields: {
        level: fields.enum(["beginner", "medium", "advanced"]),
        goal: fields.enum(["theory", "practice", "both"]),
      },
    }),
  },
})
