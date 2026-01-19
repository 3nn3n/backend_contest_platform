import express from "express"
import { success } from "../utils/response.js";
import { failure } from "../utils/response.js";
import {pool} from "../db/index.js";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/role.js";




const router = express.Router()

router.post("/create-contest", authenticateToken, authorizeRoles('creator'), async (req, res) => {
  try {
    const { title, description, startTime, endTime } = req.body;
    
    if (!title || !description || !startTime || !endTime) {
      return failure(res, 400, 'All fields are required');
    }

    const creatorId = req.user.id;
    const contest = await pool.query(
      'INSERT INTO contests (title, description, start_time, end_time, creator_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, creator_id,description,start_time, end_time', 
      [title, description,startTime, endTime, creatorId]);

    const newContest = contest.rows[0];

    return success(res, { 
      id: newContest.id,
      title: newContest.title,
      creatorId: newContest.creator_id,
      description: newContest.description,
      startTime: newContest.start_time,
      endTime: newContest.end_time
    });
  } catch (err) {
    console.error('Create contest error:', err);
    return failure(res, 500, 'Internal Server Error');
  }
})

router.post("/:contestId/mcq", authenticateToken, authorizeRoles('creator'), async (req, res) => {
  try {
    const { contestId } = req.params;
    const { questionText, options, correctOption } = req.body;
    if (!questionText || !options || options.length < 2 || correctOption === undefined) {
      return failure(res, 400, 'All fields are required and options must be at least 2');
    }
    const contestQuery = await pool.query(
      'SELECT * FROM contests WHERE id = $1', 
      [contestId]);
    if (contestQuery.rows.length === 0) {
      return failure(res, 404, 'Contest not found');
    }

    const mcq = await pool.query(
      'INSERT INTO mcq_questions (contest_id, question_text, options, correct_option) VALUES ($1, $2, $3, $4) RETURNING id, contest_id, question_text, options, correct_option', 
      [contestId, questionText, JSON.stringify(options), correctOption]);
    const newMcq = mcq.rows[0];
    return success(res, { 
      id: newMcq.id,
      contestId: newMcq.contest_id,
      questionText: newMcq.question_text,
      options: newMcq.options,
      correctOption: newMcq.correct_option
    });
  } catch (err) {
    console.error('Create MCQ error:', err);
    return failure(res, 500, 'Internal Server Error');
  }
});

router.get("/:contestId", authenticateToken, async (req, res) => {  
  try {
    const {contestId} = req.params;

    const contestQuery = await pool.query(
      'SELECT * FROM contests WHERE id = $1',
      [contestId]
    );

    if(contestQuery.rows.length === 0){
      return failure(res, 404, "contest not found")
    }

    const mcqsQuery = await pool.query(
      'SELECT id, question_text, options, correct_option FROM mcq_questions WHERE contest_id = $1',
      [contestId]
    );

    const contest = contestQuery.rows[0];
    const contestData = {
      contestId: contest.id,
      title: contest.title,
      description: contest.description,
      startTime: contest.start_time,
      endTime: contest.end_time,
      creatorId: contest.creator_id,
      mcqs: mcqsQuery.rows.map(mcq => ({
        mcqId: mcq.id,
        questionText: mcq.question_text,
        options: mcq.options,
        correctOption: mcq.correct_option
      }))
    };

    return success(res, contestData);
  }
  catch (err){
    console.error("Get mcq error", err);
    return failure(res, 500, "internal server error");
  }
});

router.post("/:contestId/dsa", authenticateToken, authorizeRoles('creator'), async (req, res) => {
  try {
    const { contestId } = req.params;
    const { title, description, tags, points, timeLimit, memoryLimit, testCases } = req.body;

    if (!title || !description || !testCases || testCases.length === 0) {
      return failure(res, 400, "Title, description and at least one test case are required");
    }

    // Verifying if teh contest exists or not, it's needed before inserting DSA problem,
    // because contest_id is a foreign key in dsa_problems table
    // and inserting a DSA problem with non-existing contest_id would cause an error
    const contestQuery = await pool.query(
      'SELECT * FROM contests WHERE id = $1',
      [contestId]
    );

    if (contestQuery.rows.length === 0) {
      return failure(res, 404, 'Contest not found');
    }

    // Inserting DSA problem into dsa_problems table 
    // and returning the inserted problem data 
    // including the generated id to be used for inserting test cases
    const dsaProblem = await pool.query(
      'INSERT INTO dsa_problems (contest_id, title, description, tags, points, time_limit, memory_limit) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, contest_id, title, description, tags, points, time_limit, memory_limit',
      [contestId, title, description, tags ? JSON.stringify(tags) : null, points || 100, timeLimit || 2000, memoryLimit || 256]
    );

    const newDsaProblem = dsaProblem.rows[0];

    // Insert test cases
    const insertedTestCases = [];
    for (const testCase of testCases) {
      const { input, expectedOutput, isHidden } = testCase;
      
      if (input === undefined || expectedOutput === undefined) {
        return failure(res, 400, 'Each test case must have input and expectedOutput');
      }

      const result = await pool.query(
        'INSERT INTO test_cases (problem_id, input, expected_output, is_hidden) VALUES ($1, $2, $3, $4) RETURNING id, problem_id, input, expected_output, is_hidden',
        [newDsaProblem.id, input, expectedOutput, isHidden || false]
      );

      insertedTestCases.push(result.rows[0]);
    }

    return success(res, {
      id: newDsaProblem.id,
      contestId: newDsaProblem.contest_id,
      title: newDsaProblem.title,
      description: newDsaProblem.description,
      tags: newDsaProblem.tags,
      points: newDsaProblem.points,
      timeLimit: newDsaProblem.time_limit,
      memoryLimit: newDsaProblem.memory_limit,
      testCases: insertedTestCases.map(tc => ({
        id: tc.id,
        input: tc.input,
        expectedOutput: tc.expected_output,
        isHidden: tc.is_hidden
      }))
    });
  } catch (err) {
    console.error("Create DSA problem error", err);
    return failure(res, 500, "Internal Server Error");
  }
});

export default router
