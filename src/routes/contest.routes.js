import express from "express"
import axios from "axios";
import { success } from "../utils/response.js";
import { failure } from "../utils/response.js";
import {pool} from "../db/index.js";
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

    // Inserting test cases into test_cases table
    // linked to the newly created DSA problem via problem_id foreign key and collecting the inserted test cases to return in the response
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

router.get("/problems/:problemId", authenticateToken, async (req, res) => {
  try {
    const { problemId } = req.params;

    const dsaProblemQuery = await pool.query(
      'SELECT id, contest_id, title, description, tags, points, time_limit, memory_limit FROM dsa_problems WHERE id = $1',
      [problemId]
    );
    if (dsaProblemQuery.rows.length === 0) {
      return failure(res, 404, "DSA problem not found");
    }
    const dsaProblem = dsaProblemQuery.rows[0];
    const testCasesQuery = await pool.query(
      'SELECT id, input, expected_output, is_hidden FROM test_cases WHERE problem_id = $1 AND is_hidden = false',
      [problemId]
    );
    const testCases = testCasesQuery.rows;

    return success(res, {
      id: dsaProblem.id,
      contestId: dsaProblem.contest_id,
      title: dsaProblem.title,
      description: dsaProblem.description,
      tags: dsaProblem.tags,
      points: dsaProblem.points,
      timeLimit: dsaProblem.time_limit,
      memoryLimit: dsaProblem.memory_limit,
      visibleTestCases: testCases.map(tc => ({
        id: tc.id,
        input: tc.input,
        expectedOutput: tc.expected_output,
        isHidden: tc.is_hidden
      }))
    });
  }
  catch (err) {
    console.error("Get DSA problem error", err);
    return failure(res, 500, "internal server error");
  }
});

router.post("/:contestId/mcq/:questionId/submit", 
  authenticateToken, 
  authorizeRoles('contestant'), 
  async (req, res) => {
    try {
      const { contestId, questionId } = req.params;
      const { selectedOptionIndex } = req.body;
      const userId = req.user.id;

      if(!contestId || !questionId) {
        return failure(res, 400, "wrong contestId or questionId");
      }

      if (selectedOptionIndex === undefined) {
        return failure(res, 400, "selectedOptionIndex is required");
      }

      const questionQuery = await pool.query(
        'SELECT * FROM mcq_questions WHERE id = $1 AND contest_id = $2',
        [questionId, contestId]
      );
      if (questionQuery.rows.length === 0) {
        return failure(res, 404, "MCQ question not found for this contest");
      }
      const question = questionQuery.rows[0];
      const isCorrect = question.correct_option === selectedOptionIndex;
      const pointsEarned = isCorrect ? 1 : 0;

      const submission = await pool.query(
        'INSERT INTO mcq_submissions (user_id, question_id, selected_option_index, is_correct, points_earned) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, question_id, selected_option_index, is_correct, points_earned',
        [userId, questionId, selectedOptionIndex, isCorrect, pointsEarned]
      );
      const newSubmission = submission.rows[0];

      return success(res, {
        isCorrect: newSubmission.is_correct,
        pointsEarned: newSubmission.points_earned
      });

    } catch (err) {
      console.error("Submit MCQ answer error", err);
      return failure(res, 500, "Internal Server Error");
    }
  });

  router.post("/problems/:problemId/submit", 
    authenticateToken, 
    authorizeRoles('contestant'),
    async (req, res) => {
      try {
        const { problemId } = req.params;
        const { code, languageId } = req.body;
        const userId = req.user.id;

        if (!code || !languageId) {
          return failure(res, 400, "code and languageId are required");
        }

        // Get problem and test cases
        const problemQuery = await pool.query(
          'SELECT * FROM dsa_problems WHERE id = $1',
          [problemId]
        );
        if (problemQuery.rows.length === 0) {
          return failure(res, 404, "DSA Problem not found");
        }
        const problem = problemQuery.rows[0];

        const testCasesQuery = await pool.query(
          'SELECT * FROM test_cases WHERE problem_id = $1',
          [problemId]
        );
        const testCases = testCasesQuery.rows;

        if (testCases.length === 0) {
          return failure(res, 400, "No test cases found for this problem");
        }

        // Submit to Judge0 for each test case
        let passedTests = 0;
        let totalTests = testCases.length;
        let status = 'Accepted';

        for (const testCase of testCases) {
          try {
            // Create submission
            const submissionResponse = await axios.post(
              `${process.env.JUDGE0_API_URL}/submissions`,
              {
                source_code: code,
                language_id: languageId,
                stdin: testCase.input,
                expected_output: testCase.expected_output
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                  'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
                }
              }
            );

            const token = submissionResponse.data.token;

            // Wait and get result
            await new Promise(resolve => setTimeout(resolve, 2000));

            const resultResponse = await axios.get(
              `${process.env.JUDGE0_API_URL}/submissions/${token}`,
              {
                headers: {
                  'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                  'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
                }
              }
            );

            const result = resultResponse.data;

            // Check if test passed (status_id 3 = Accepted)
            if (result.status.id === 3) {
              passedTests++;
            } else {
              status = result.status.description || 'Wrong Answer';
            }
          } catch (judgeError) {
            console.error('Judge0 API error:', judgeError);
            status = 'Runtime Error';
          }
        }

        // Calculate points
        const pointsEarned = passedTests === totalTests ? problem.points : 0;
        if (passedTests !== totalTests) {
          status = 'Wrong Answer';
        }

        // Save submission to database
        const submission = await pool.query(
          'INSERT INTO dsa_submissions (user_id, problem_id, code, language, status, points_earned, test_cases_passed, total_test_cases) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, points_earned, test_cases_passed, total_test_cases',
          [userId, problemId, code, languageId.toString(), status, pointsEarned, passedTests, totalTests]
        );

        const newSubmission = submission.rows[0];

        return success(res, {
          status: newSubmission.status,
          pointsEarned: newSubmission.points_earned,
          testCasesPassed: newSubmission.test_cases_passed,
          totalTestCases: newSubmission.total_test_cases
        });

      } catch (err) {
        console.error("Submit DSA solution error", err);
        return failure(res, 500, "Internal Server Error");
      }
    });

  router.get("/contests/:contestId/leaderboard", 
    authenticateToken, 
    async (req, res) => {
      try {
        const { contestId } = req.params;

        if (!contestId) {
          return failure(res, 400, "contestId is required");
        }

        const leaderboardQuery = await pool.query(
          `WITH mcq_points AS (
            SELECT 
              mcq.user_id,
              COALESCE(SUM(mcq.points_earned), 0) AS mcq_total
            FROM mcq_submissions mcq
            INNER JOIN mcq_questions mq ON mcq.question_id = mq.id
            WHERE mq.contest_id = $1
            GROUP BY mcq.user_id
          ),
          dsa_best_points AS (
            SELECT 
              dsa.user_id,
              dsa.problem_id,
              MAX(dsa.points_earned) AS best_points
            FROM dsa_submissions dsa
            INNER JOIN dsa_problems dp ON dsa.problem_id = dp.id
            WHERE dp.contest_id = $1
            GROUP BY dsa.user_id, dsa.problem_id
          ),
          dsa_totals AS (
            SELECT 
              user_id,
              COALESCE(SUM(best_points), 0) AS dsa_total
            FROM dsa_best_points
            GROUP BY user_id
          ),
          user_scores AS (
            SELECT 
              u.id AS user_id,
              u.name AS username,
              COALESCE(mcq.mcq_total, 0) + COALESCE(dsa.dsa_total, 0) AS total_points
            FROM users u
            LEFT JOIN mcq_points mcq ON u.id = mcq.user_id
            LEFT JOIN dsa_totals dsa ON u.id = dsa.user_id
            WHERE COALESCE(mcq.mcq_total, 0) + COALESCE(dsa.dsa_total, 0) > 0
          )
          SELECT 
            user_id,
            username,
            total_points,
            DENSE_RANK() OVER (ORDER BY total_points DESC) AS rank
          FROM user_scores
          ORDER BY total_points DESC, username ASC`,
          [contestId]
        );

        const leaderboard = leaderboardQuery.rows.map(row => ({
          userId: row.user_id,
          username: row.username,
          totalPoints: parseInt(row.total_points, 10),
          rank: parseInt(row.rank, 10)
        }));

        return success(res, { leaderboard });
      }
      catch (err) {
        console.error("Get leaderboard error", err);
        return failure(res, 500, "internal server error");
      }
  });

export default router

